// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const { spawn } = require('child_process')
const EventEmitter = require('events')
const crypto = require('crypto')
const Descriptor = require('./descriptor')
const fs = require('fs')
require('./components')
const Pipeline = require('./pipeline')

Vue.filter('parseFloat', function (value) {
    let v = parseFloat(value) || 100
    return v
})

function createChunker(size, fn) {
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


class DownloadManager {
    constructor() {
        this.descriptor = new Descriptor()
        this.emitter = new EventEmitter()
        this.downloads = {}

        this._downloadPipeline = null

        this.downloadPipeline.onValue(({ done, ticker }, download) => {
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
                    this._handleDataLine({ ...download, line })
                }
            })

            download.job.stderr.on('data', (err) => {
                console.error(err.toString())
                download.errors.push(err.toString())
                this._handleError(download, err.toString())
            })

            download.job.on('close', () => {
                done()
                this.emitter.emit('downloaded', download)
                delete this.downloads[download.handle]
            })

            this.downloads[download.handle] = download
        })
    }

    get downloadPipeline() {
        if (!this._downloadPipeline) {
            this._downloadPipeline = new Pipeline(4)
            this._downloadPipeline.onZero(() => {
                this.emitter.emit('done')
            })
        }
        return this._downloadPipeline
    }

    _handleDataLine(download) {
        const description = this.descriptor.get(download.line)

        if (!description) return

        // console.log(payload)
        this.emitter.emit('payload', { ...download, description })
    }

    _handleError(download, error) {
        this.emitter.emit('error', download, error)
    }

    _createHandle(value) {
        return 'id-' + crypto.createHmac('sha256', 'secret')
            .update(value)
            .digest('hex')
            .substr(0, 10)
    }

    _getInformation(url, onVideo) {
        // title     = WHAT IS LIFE BUT DEATH PENDING? - Part 1 - VAMPYR Let's Play Walkthrough Gameplay
        // id        = 3ckt5UfqgrM
        // thumbnail = https://i.ytimg.com/vi/3ckt5UfqgrM/maxresdefault.jpg
        // duration  = 1:37:25
        const yid = spawn(
            'youtube-dl',
            '--get-title --get-thumbnail --get-duration --get-id'.split(' ')
        )

        const chunker = createChunker(4, ([title, id, thumbnail, duration]) => {
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
        downloadId,
        audioOnly = false,
        concurrent
    }) {
        try {
            fs.mkdirSync(destinationPath)
        } catch (e) { }
        this.downloadPipeline._maxCount = concurrent
        this._getInformation(
            downloadId,
            (err, video) => {
                if (!err)
                    this.downloadPipeline.push({
                        handle: this._createHandle(video.id),
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
        this.downloadPipeline.onQueue(callback)
    }

    onDequeue(callback) {
        this.downloadPipeline.onDequeue(callback)
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


const downloadManager = new DownloadManager()

const app = new Vue({
    el: '#app',
    methods: {
        download({ downloadId, destinationPath, audioOnly, concurrent }) {
            console.log(downloadId, destinationPath, audioOnly, concurrent)
            downloadManager.download({
                destinationPath,
                downloadId,
                audioOnly,
                concurrent
            })
        },
        clear() {
            this.orderedQueue = {}
            this.completedDownloads = {
            }
            this.downloads = {
                "aspdoifjapsodfji": {
                    handle: "apsodijf",
                    ticker: 0,
                    video: {
                        id: 12,
                        title: "hi"
                    },
                    description: {
                        eta: "asdf",
                        percentComplete: "12%",
                        size: "14g"
                    }
                }

            }
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

window.downloadManager = downloadManager

downloadManager.onPayload((download) => {
    if (download.description) {
        Vue.set(app.downloads, download.handle, download)
    }
})

downloadManager.onError((download, error) => {
    if (app.downloads[download.handle]) {
        app.downloads[download.handle].errors.push(error)
    } else if (app.orderedQueue[download.handle]) {
        app.orderedQueue[download.handle].errors.push(error)
    } else if (app.orderedDownloads[download.handle]) {
        app.orderedDownloads[download.handle].errors.push(error)
    } else {
        console.log('error', download.video.title, error)
    }
})

downloadManager.onQueue(download => {
    console.log('queue', download.handle)
    Vue.set(app.orderedQueue, download.handle, download)
})

downloadManager.onDequeue(download => {
    console.log('dequeue', download.handle)
    Vue.delete(app.orderedQueue, download.handle)
})

downloadManager.onDownloaded(payload => {
    Vue.set(app.completedDownloads, payload.handle, payload)
    Vue.delete(app.downloads, payload.handle)
    // downloadColumn.markDone(id)
})

downloadManager.onFailed(payload => {
    console.log(payload)
})

downloadManager.onDone(() => {
    // form.reset()
})
