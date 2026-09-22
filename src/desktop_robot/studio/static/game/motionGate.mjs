/**
 * Explicit motion token: arm before waiting so waiters are never lost
 * when distance-based `moving` is briefly false.
 */
export function createMotionGate() {
  let waiters = [];
  let moving = false;
  return {
    get moving() {
      return moving;
    },
    set moving(value) {
      moving = !!value;
    },
    armMotion(alreadyThere) {
      if (alreadyThere) {
        moving = false;
        return Promise.resolve();
      }
      moving = true;
      return new Promise((resolve) => waiters.push(resolve));
    },
    waitForMotion() {
      if (waiters.length || moving) {
        return new Promise((resolve) => waiters.push(resolve));
      }
      return Promise.resolve();
    },
    finishMotion() {
      moving = false;
      for (const resolve of waiters.splice(0)) resolve();
    },
  };
}
