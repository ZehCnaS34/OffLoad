const EventEmitter = require('events')

class Pipeline {
    constructor(maxCount = 6) {
        this.active = new Set()
        this.queue = []
        this.completed = new Set()

        this.ticker = 0

        this._maxCount = maxCount
        this.emitter = new EventEmitter()

    }

    set maxCount(value) {
        this._maxCount = value
        this._run()
    }

    percentComplete() {
        return this.completed.length / this.queue.length
    }

    push(value) {
        this.emitter.emit('queued', value)
        this.queue.push(value)
        this._run()
    }

    _done(task) {
        return {
            ticker: this.ticker++,
            queueSize: this.queue.length,
            activeSize: this.active.size,
            completedSize: this.completed.size,
            done: () => {
                this.active.delete(task)
                this.completed.add(task)
                this._run()
            }

        }
    }

    _run() {
        if (this.active.size >= this._maxCount || this.queue.length === 0) {
            // console.log(`Task waiting :: running=${this.active.size} queue=${this.queue.length}`)
            if (this.active.size === 0 && this.queue.length === 0) {
                this.emitter.emit('zero')
            }
            return

        }
        const task = this.queue.shift()
        this.emitter.emit('dequeue', task);
        // console.log(`Running task=${task}`)
        this.active.add(task)
        this.emitter.emit('data', this._done(task), task)
    }

    onValue(callback) {
        this.emitter.on('data', callback)
    }

    onQueue(callback) {
        this.emitter.on('queued', callback)
    }

    onDequeue(callback) {
        this.emitter.on('dequeue', callback)
    }

    onZero(callback) {
        this.emitter.on('zero', callback)
    }

    clear() {
        this.ticker = 0
        // console.log('TaskLoop Cleared')
        this.queue = []
        this.active = new Set()
        // clearInterval(this.looper)
    }
}

module.exports = Pipeline