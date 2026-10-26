/**
 * Tab Lock Coordinator (Single-Editor Lock)
 * Coordinates edit ownership when the same project is open in multiple browser tabs or windows.
 * Uses the native BroadcastChannel API with localStorage heartbeat fallback.
 */

// Generate a unique identifier for this browser tab session
export const CURRENT_TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `tab_${Math.random().toString(36).substring(2)}_${Date.now()}`;

const CHANNEL_NAME = 'montage_project_lock_channel';

class TabLockCoordinator {
  constructor() {
    this.tabId = CURRENT_TAB_ID;
    this.channel = null;
    this.currentProjectId = null;
    this.isOwner = true; // By default, sole tab is owner
    this.ownerTabId = CURRENT_TAB_ID;
    this.listeners = new Set();
    this.heartbeatTimer = null;
    this.lastOwnerHeartbeat = Date.now();

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = this.handleMessage.bind(this);
      } catch (err) {
        console.warn('[TabLock] BroadcastChannel initialization error, using storage fallback:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorageEvent.bind(this));
      window.addEventListener('beforeunload', () => {
        this.releaseCurrentLock();
      });
    }
    this.handoverCallbacks = new Set();
    this.pendingHandoverResolvers = new Map();
  }

  onPrepareHandover(callback) {
    this.handoverCallbacks.add(callback);
    return () => {
      this.handoverCallbacks.delete(callback);
    };
  }

  async triggerHandoverFlush() {
    for (const cb of this.handoverCallbacks) {
      try {
        await Promise.resolve(cb());
      } catch (err) {
        console.warn('[TabLock] Error in handover callback:', err);
      }
    }
  }

  notifyListeners() {
    this.listeners.forEach((fn) => {
      try {
        fn({
          isOwner: this.isOwner,
          ownerTabId: this.ownerTabId,
          tabId: this.tabId,
          projectId: this.currentProjectId
        });
      } catch (err) {
        console.error('[TabLock] Listener error:', err);
      }
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Send immediate initial state
    listener({
      isOwner: this.isOwner,
      ownerTabId: this.ownerTabId,
      tabId: this.tabId,
      projectId: this.currentProjectId
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  post(type, payload = {}) {
    const message = {
      type,
      tabId: this.tabId,
      projectId: this.currentProjectId,
      timestamp: Date.now(),
      ...payload
    };

    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (_) {}
    }

    // Storage fallback for cross-window events
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('montage_lock_msg', JSON.stringify(message));
      }
    } catch (_) {}
  }

  handleStorageEvent(e) {
    if (e.key === 'montage_lock_msg' && e.newValue) {
      try {
        const msg = JSON.parse(e.newValue);
        if (msg.tabId !== this.tabId) {
          this.processMessage(msg);
        }
      } catch (_) {}
    }
  }

  handleMessage(event) {
    const msg = event?.data;
    if (!msg || msg.tabId === this.tabId) return;
    this.processMessage(msg);
  }

  processMessage(msg) {
    // Only process messages relevant to our currently monitored project
    if (!this.currentProjectId || msg.projectId !== this.currentProjectId) return;

    switch (msg.type) {
      case 'WHO_HAS_LOCK':
        // If we currently own the lock, announce it
        if (this.isOwner) {
          this.post('I_HAVE_LOCK', { ownerTabId: this.tabId });
        }
        break;

      case 'I_HAVE_LOCK':
        // Another tab has claimed ownership
        if (msg.tabId !== this.tabId) {
          this.lastOwnerHeartbeat = Date.now();
          if (this.isOwner) {
            this.isOwner = false;
          }
          this.ownerTabId = msg.tabId;
          this.notifyListeners();
        }
        break;

      case 'CLAIM_LOCK':
        // Another tab explicitly took control
        if (msg.tabId !== this.tabId) {
          this.isOwner = false;
          this.ownerTabId = msg.tabId;
          this.lastOwnerHeartbeat = Date.now();
          this.notifyListeners();
        }
        break;

      case 'RELEASE_LOCK':
        // Current owner tab is closing or leaving
        if (this.ownerTabId === msg.tabId) {
          this.ownerTabId = null;
          // Optionally, this tab can automatically claim it or stay in stand-by
          this.notifyListeners();
        }
        break;

      case 'HEARTBEAT':
        if (msg.tabId === this.ownerTabId) {
          this.lastOwnerHeartbeat = Date.now();
        }
        break;

      case 'PREPARE_HANDOVER':
        if (this.isOwner) {
          (async () => {
            try {
              await this.triggerHandoverFlush();
            } catch (_) {}
            this.post('HANDOVER_READY', { handoverId: msg.handoverId });
          })();
        }
        break;

      case 'HANDOVER_READY':
        if (msg.handoverId && this.pendingHandoverResolvers.has(msg.handoverId)) {
          const resolve = this.pendingHandoverResolvers.get(msg.handoverId);
          this.pendingHandoverResolvers.delete(msg.handoverId);
          resolve();
        }
        break;

      default:
        break;
    }
  }

  /**
   * Spectator tab requests the owner tab to flush pending changes to disk/cache, then claims lock
   */
  async requestHandoverAndClaim(timeoutMs = 350) {
    if (!this.currentProjectId) return;
    const handoverId = `ho_${Math.random().toString(36).substring(2)}_${Date.now()}`;

    const waitForFlush = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingHandoverResolvers.delete(handoverId);
        resolve();
      }, timeoutMs);

      this.pendingHandoverResolvers.set(handoverId, () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.post('PREPARE_HANDOVER', { handoverId });
    await waitForFlush;
    this.claimLock();
  }


  /**
   * Starts monitoring and coordinating locks for a specific project
   */
  watchProject(projectId) {
    if (this.currentProjectId === projectId) return;

    // Release old project lock if we were holding it
    if (this.currentProjectId) {
      this.releaseCurrentLock();
    }

    this.currentProjectId = projectId;
    this.isOwner = true; // Assume owner until an existing owner responds
    this.ownerTabId = this.tabId;
    this.lastOwnerHeartbeat = Date.now();

    // Query if there's already an existing owner tab
    this.post('WHO_HAS_LOCK');

    // Give existing tabs 250ms to declare ownership
    setTimeout(() => {
      // Check localStorage cached lock indicator
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(`montage_active_lock_${projectId}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            const isFresh = Date.now() - parsed.timestamp < 7000;
            if (isFresh && parsed.tabId !== this.tabId) {
              this.isOwner = false;
              this.ownerTabId = parsed.tabId;
              this.notifyListeners();
            }
          }
        }
      } catch (_) {}
    }, 180);

    // Start heartbeat
    this.startHeartbeat();
    this.notifyListeners();
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.currentProjectId) return;

      if (this.isOwner) {
        this.post('HEARTBEAT');
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`montage_active_lock_${this.currentProjectId}`, JSON.stringify({
              tabId: this.tabId,
              timestamp: Date.now()
            }));
          }
        } catch (_) {}
      } else {
        // If owner hasn't sent a heartbeat in 8 seconds, the other tab likely crashed or closed
        if (Date.now() - this.lastOwnerHeartbeat > 8500) {
          console.log('[TabLock] Owner tab timed out, lock is now available.');
          this.ownerTabId = null;
          this.notifyListeners();
        }
      }
    }, 2800);
  }

  /**
   * User explicitly clicks "Tomar el control"
   */
  claimLock() {
    if (!this.currentProjectId) return;
    this.isOwner = true;
    this.ownerTabId = this.tabId;
    this.lastOwnerHeartbeat = Date.now();

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`montage_active_lock_${this.currentProjectId}`, JSON.stringify({
          tabId: this.tabId,
          timestamp: Date.now()
        }));
      }
    } catch (_) {}

    this.post('CLAIM_LOCK');
    this.notifyListeners();
  }

  releaseCurrentLock() {
    if (!this.currentProjectId) return;

    if (this.isOwner) {
      this.post('RELEASE_LOCK');
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(`montage_active_lock_${this.currentProjectId}`);
        }
      } catch (_) {}
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  destroy() {
    this.releaseCurrentLock();
    if (this.channel) {
      try {
        this.channel.close();
      } catch (_) {}
    }
    this.listeners.clear();
  }
}

export const tabLockCoordinator = new TabLockCoordinator();
