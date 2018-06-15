// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const { spawn } = require('child_process')
const EventEmitter = require('events')
const crypto = require('crypto')
const P = require('parsimmon')
const Descriptor = require('./descriptor')

Vue.filter('parseFloat', function (value) {
    return parseFloat(value)
})

function hex(value) {
    return 'id-' + crypto.createHmac('sha256', 'secret')
        .update(value)
        .digest('hex')
}

const grid = document.getElementsByClassName('grid')[0]
grid.style.height = `${window.innerHeight}px`
window.onresize = function () {
    console.log('resizing')
    grid.style.height = `${window.innerHeight}px`
}

function debounce(fn, amount) {
    let action
    return function (...args) {
        if (typeof action !== 'undefined') {
            clearTimeout(action)
        }
        action = setTimeout(function () {
            fn(...args)
        }, amount)
    }
}

class LimitQueue {
    constructor(maxCount = 6) {
        this.active = new Set()
        this.queue = []
        this.completed = new Set()
        
        this.ticker = 0

        this.maxCount = maxCount
        this.emitter = new EventEmitter()

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
        if (this.active.size >= this.maxCount || this.queue.length === 0) {
            console.log(`Task waiting :: running=${this.active.size} queue=${this.queue.length}`)
            if (this.active.size === 0 && this.queue.length === 0) {
                this.emitter.emit('zero')
            }
            return

        }
        const task = this.queue.shift()
        this.emitter.emit('dequeue', task);
        console.log(`Running task=${task}`)
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
        console.log('TaskLoop Cleared')
        this.queue = []
        this.active = new Set()
        // clearInterval(this.looper)
    }
}

class DownloadManager {
    constructor() {
        this.descriptor = new Descriptor()
        this.emitter = new EventEmitter()
        this.downloads = {}
        this.yd = null
        this.ydp = null

        this._idQueue = null

        this.idQueue.onValue(({done, ticker}, {id, audioOnly, destinationPath}) => {
            this.getTitle(id)
                .then(title => {
                    const handle = this.createHandle(title)
                    const args = [
                        '--newline',
                        '-o',
                        `%(title)s.%(ext)s`,
                        `https://youtube.com/watch?v=${id}`
                        
                    ];
                    if (audioOnly) {
                        args.unshift('-x')
                    }

                    const download = {
                        ticker,
                        id, title,
                        job: spawn('youtube-dl', args, { cwd: destinationPath })
                    }

                    download.job.stdout.on('data', (data) => {
                        for (const line of data.toString().trim().split('\n')) {
                            this.handlePayload({handle, line, ticker})
                        }
                    })

                    download.job.stderr.on('data', (err) => {
                        console.error(err.toString())
                    })

                    download.job.on('close', (data) => {
                        done()
                        this.emitter.emit('downloaded', { handle, id, title })
                        delete this.downloads[handle]
                    })

                    this.downloads[handle] = download
                })
                .catch((err) => {
                    done()
                    console.error(err.toString())
                })
        })
    }

    get idQueue() {
        if (!this._idQueue) {
            this._idQueue = new LimitQueue(4)
            this._idQueue.onZero(() => {
                console.log('-----DONE-----')
                this.emitter.emit('done')
            })
        }
        return this._idQueue
    }

    createHandle(value) {
        return 'id-' + crypto.createHmac('sha256', 'secret')
            .update(value)
            .digest('hex')
            .substr(0, 10)
    }

    getTitle(id) {
        return new Promise((resolve, reject) => {
            let title = ""

            const yid = spawn('youtube-dl', ['--get-title', id])

            yid.stdout.on('data', (data) => {
                title = title + data.toString()
            })

            yid.stderr.on('data', (err) => reject(err))

            yid.on('close', () => {
                resolve(title)
            })
        })
    }

    getIds(playlistId, onId) {
        // console.log(`getIds(${playlistId}, onId)`)
        const yid = spawn('youtube-dl', ['--get-id', playlistId])

        yid.stdout.on('data', (data) => {
            for (const line of data.toString().trim().split('\n')) {
                console.log(`line=${line}`)
                if (line) {
                    onId(null, line)
                }
            }
        })

        yid.stderr.on('data', (err) => {
            onId(err)
            console.error(playlistId, err.toString())
            this.emitter.emit('failed', {
                context: {
                    method: 'getIds',
                    args: [playlistId, onId]
                },
                err: err.toString()
            })
        })
    }

    handlePayload({handle, line, ticker}) {
        const description = this.descriptor.get(line)

        if (!description) {
            // console.log(handle, line)
            return
        }

        const payload = {
            handle,
            ticker,
            description,
            id: this.downloads[handle].id,
            title: this.downloads[handle].title
        }

        // console.log(payload)

        this.emitter.emit('payload', payload)
    }

    download({
        destinationPath,
        playlistId,
        audioOnly = false,
        concurrent
    }) {
        this.idQueue.maxCount = concurrent
        this.getIds(
            playlistId,
            (err, id) => {
                if (err) return
                this.idQueue.push({id, destinationPath, audioOnly, playlistId})
            }
        )
    }

    onQueue(callback) {
        this.idQueue.onQueue(callback)
    }

    onDequeue(callback) {
        this.idQueue.onDequeue(callback)
    }

    onDone(callback) {
        this.emitter.on('done', callback)
    }

    onDownloaded(callback) {
        this.emitter.on('downloaded', callback)
    }
    
    onFailed(callback) {
        this.emitter.on('failed', callback)
    }

    onPayload(callback) {
        this.emitter.on('payload', callback)
    }

    cancel() {
        for (const handle in this.downloads) {
            this.downloads[handle].job.kill('SIGINT')
            delete this.downloads[handle]
        }
    }
}

DownloadManager.VIDEO = 'Video'
DownloadManager.PLAYLIST = 'Playlist'
DownloadManager.CHANNEL = 'Channel'

const downloadManager = new DownloadManager()

Vue.component('e-checkbox', {
    props: ['label', 'value'],
    template: `
        <div class="form-group">
            <label class="form-label">{{label}}</label>
            <input 
                type='checkbox'
                class="form-control"
                v-bind:value="value"
                v-on:input="$emit('input', $event.target.value)"
                />
        </div>
    `
})

Vue.component('e-text', {
    props: ['label', 'value', 'disabled'],
    template: `
        <div class="form-group">
            <label class="form-label">{{label}}</label>
            <input 
                v-bind:disabled='disabled'
                class="form-control"
                v-bind:value="value"
                v-on:input="$emit('input', $event.target.value)"
                />
        </div>
    `
})

Vue.component('e-select', {
    props: ['label', 'options', 'value'],
    template: `
        <div class="form-group">
            <label class="form-label">{{label}}</label>
            <select name="download-type" class="form-control" v-bind:value="value">
                <option 
                    v-for="option in options"
                    v-on:input="$emit('input', $event.target.value)">
                    {{option}}
                </option>
            </select>
        </div>
    `
})

Vue.component('download-item', {
    props: ['item'],
    template: `
        <div class="download scroll" v-for="download in orderedDownloads">
            <h5>{{download.title}}</h5>
            <p>
                <span>
                <progress v-value="download.percentComplete" max="100" ></progress>
                {{download.percentComplete | parseFloat}}
                </span>
                <span>Size:{{download.size}}</span>
                <span>ETA:{{download.eta}}</span>
            </p>
        </div>
    `
})

Vue.component('config-form', {
    data() {
        return {
            downloadId: 'PLj_Goi54wf0c_cSau6aJNd7tuNwHgYH-5',
            destinationPath: '/home/alex/Videos/Christopher Odd',
            audioOnly: false,
            concurrent: 4,
            concurrentOptions: [ 2, 4, 8, 16, 32 ],
            downloadType: 'Playlist',
            downloadTypes: [
                'Playlist',
                'Video'
            ],
            busy: false
        }
    },
    methods: {
        start() {
            this.$emit('start', {
                downloadId: this.downloadId,
                destinationPath: this.destinationPath,
                audioOnly: this.audioOnly,
                downloadType: this.downloadType,
                concurrent: this.concurrent

            })
        }
    },
    template: `
        <div class="card-body" id="config">
            <e-text
                :disabled="busy"
                label="Download Id"
                v-model="downloadId"
                />
            <e-text
                :disabled="busy"
                label="Destination Path"
                v-model="destinationPath"
                />
            <e-checkbox
                :disabled="busy"
                label="Audio Only"
                v-model="audioOnly"
                />
            <e-select
                :disabled="busy"
                label="Download Type"
                v-bind:options="downloadTypes"
                v-model="downloadType"
                />
            <e-select
                :disabled="busy"
                label='Concurrent Downloads'
                v-bind:options='concurrentOptions'
                v-model='concurrent'
                />
            <div v-if="busy">
                <button id="start-btn" class="btn" v-on:click="stop()">stop</button>
            </div>
            <div v-else>
                <button id="start-btn" class="btn" v-on:click="start()">start</button>
            </div>
        </div>
    `
})

const downloadColumn = new Vue({
    el: '#app',
    methods: {
        download({downloadId, destinationPath, audioOnly, concurrent}) {
            downloadManager.download({
                destinationPath,
                playlistId: downloadId,
                audioOnly,
                concurrent
            })
        },
        clear() {
            this.orderedQueue = {}
            this.completedDownloads = {}
            this.downloads = {}
        }
    },
    computed: {
        orderedDownloads() {
            return Object.values(this.downloads).sort((left, right) => {
                return left.ticker < right.ticker
            })
        }
    },
    data: {
        orderedQueue: {},
        completedDownloads: {},
        downloads: {}
    }
})

window.downloadColumn = downloadColumn
window.downloadManager = downloadManager

downloadManager.onPayload(({ handle, title, description, id, ticker }) => {
    if (description) {
        Vue.set(downloadColumn.downloads, handle, {
            ticker,
            id,
            title,
            percentComplete: description.percentComplete,
            size: description.size,
            eta: description.eta,
            done: false
        })
    }
})

downloadManager.onQueue(task => {
    console.log('queue', task)
    Vue.set(downloadColumn.orderedQueue, task.id, task)
})

downloadManager.onDequeue(task => {
    console.log('dequeue', task)
    Vue.delete(downloadColumn.orderedQueue, task.id)
})

downloadManager.onDownloaded(payload => {
    Vue.set(downloadColumn.completedDownloads, payload.handle, payload)
    Vue.delete(downloadColumn.downloads, payload.handle)
    // downloadColumn.markDone(id)
})

downloadManager.onFailed(payload => {
    console.log(payload)
})

downloadManager.onDone(() => {
    // form.reset()
})
