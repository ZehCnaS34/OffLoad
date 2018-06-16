// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const { spawn } = require('child_process')
const EventEmitter = require('events')
const crypto = require('crypto')
const P = require('parsimmon')
const Descriptor = require('./descriptor')
const fs = require('fs')
require('./components')

Vue.filter('parseFloat', function (value) {
    let v = parseFloat(value) || 100
    return  v
})

function hex(value) {
    return 'id-' + crypto.createHmac('sha256', 'secret')
        .update(value)
        .digest('hex')
}

function chunk(size, fn) {
    let load = []
    return function (value) {
        load.push(value)
        if (load.length === size) {
            fn(load)
            load = []
        }
    }
}

const grid = document.getElementById('app')
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

class Pipeline {
    constructor(maxCount = 6) {
        this.active = new Set()
        this.queue = []
        this.completed = new Set()
        
        this.ticker = 0

        this.maxCount = maxCount
        this.emitter = new EventEmitter()

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
        if (this.active.size >= this.maxCount || this.queue.length === 0) {
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

class DownloadManager {
    constructor() {
        this.descriptor = new Descriptor()
        this.emitter = new EventEmitter()
        this.downloads = {}
        this.yd = null
        this.ydp = null

        this._idQueue = null

        this.idQueue.onValue(({done, ticker}, download) => {
            // {video, audioOnly, destinationPath}
            // const handle = this.createHandle(download.video.title)
            const args = [
                '--newline',
                '-o',
                `%(title)s.%(ext)s`,
                `https://youtube.com/watch?v=${download.video.id}`
            ];

            if (download.audioOnly) {
                args.unshift('-x')
            }

            download.ticker = ticker
            download.job = spawn('youtube-dl', args, { cwd: download.destinationPath })

            download.job.stdout.on('data', (data) => {
                for (const line of data.toString().trim().split('\n')) {
                    this.handlePayload({...download, line})
                }
            })

            download.job.stderr.on('data', (err) => {
                console.error(err.toString())
                download.errors.push(err.toString())
                this.handleError(download, err.toString())
            })

            download.job.on('close', (data) => {
                done()
                this.emitter.emit('downloaded', download)
                delete this.downloads[download.handle]
            })

            this.downloads[download.handle] = download
        })
    }

    get idQueue() {
        if (!this._idQueue) {
            this._idQueue = new Pipeline(4)
            this._idQueue.onZero(() => {
                console.log('-----DONE-----')
                this.emitter.emit('done')
            })
        }
        return this._idQueue
    }

    handlePayload(download) {
        const description = this.descriptor.get(download.line)

        if (!description) return

        // console.log(payload)
        this.emitter.emit('payload', {...download, description})
    }

    handleError(download, error) {
        this.emitter.emit('error', download, error)
    }

    createHandle(value) {
        return 'id-' + crypto.createHmac('sha256', 'secret')
            .update(value)
            .digest('hex')
            .substr(0, 10)
    }

    getInformation(url, onVideo) {
        // title     = WHAT IS LIFE BUT DEATH PENDING? - Part 1 - VAMPYR Let's Play Walkthrough Gameplay
        // id        = 3ckt5UfqgrM
        // thumbnail = https://i.ytimg.com/vi/3ckt5UfqgrM/maxresdefault.jpg
        // duration  = 1:37:25
        const yid = spawn(
            'youtube-dl', 
            '--get-title --get-thumbnail --get-duration --get-id'.split(' ')
        )

        const chunker = chunk(4, ([title, id, thumbnail, duration]) => {
            onVideo(null, { title, id, thumbnail, duration, url })
        })

        yid.stdout.on('data', (data) => {
            data.toString()
                .trim()
                .split('\n')
                .filter(line => line !== '')
                .map(chunker)
        })

        yid.stderr.on('data', (err) => {
            onVideo({
                err: err.toString(),
                url,
            })
        })

    }

    download({
        destinationPath,
        playlistId,
        audioOnly = false,
        concurrent
    }) {
        try {
            fs.mkdirSync(destinationPath)
        } catch (e) {}
        this.idQueue.maxCount = concurrent
        this.getInformation(
            playlistId,
            (err, video) => {
                if (err) return
                this.idQueue.push({
                    handle: this.createHandle(video.id),
                    errors: [],
                    concurrent,
                    destinationPath,
                    audioOnly,
                    video
                })
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

    onError(callback) {
        this.emitter.on('error', callback)
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

const downloadColumn = new Vue({
    el: '#app',
    methods: {
        download({downloadId, destinationPath, audioOnly, concurrent}) {
            console.log(downloadId, destinationPath, audioOnly, concurrent)
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
            return Object
                .values(this.downloads)
                .sort((left, right) => left.ticker < right.ticker)
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

downloadManager.onPayload((download) => {
    if (download.description) {
        Vue.set(downloadColumn.downloads, download.handle, download)
    }
})

downloadManager.onError((download, error) => {
    if (downloadColumn.downloads[download.handle]) {
        downloadColumn.downloads[download.handle].errors.push(error)
    } else if (downloadColumn.orderedQueue[download.handle]) {
        downloadColumn.orderedQueue[download.handle].errors.push(error)
    } else if (downloadColumn.orderedDownloads[download.handle]) {
        downloadColumn.orderedDownloads[download.handle].errors.push(error)
    } else {
        console.log('error', download.video.title, error)
    }
})

downloadManager.onQueue(download => {
    console.log('queue', download.handle)
    Vue.set(downloadColumn.orderedQueue, download.handle, download)
})

downloadManager.onDequeue(download => {
    console.log('dequeue', download.handle)
    Vue.delete(downloadColumn.orderedQueue, download.handle)
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
