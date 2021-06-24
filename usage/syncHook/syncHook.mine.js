/**
 * 原理实现
 */

class SyncHook {
    constructor() {
        this.taps = []
    }

    tap (name, fn) {
        this.taps.push(fn)
    }

    call() {
        this.taps.forEach(fn => fn(...arguments))
    }
}