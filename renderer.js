// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const { Map: IMap } = require('immutable')
const mkdirp = require('mkdirp')
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

        this.downloadPipeline.onValue(({ done, ticker }, handle) => {
            // {video, audioOnly, destinationPath}
            // const handle = this.createHandle(download.video.title)
            let download = this.downloads[handle]
            const args = [
                '--newline',
                '-o',
                `%(title)s.%(ext)s`,
                `https://youtube.com/watch?v=${download.get('video').id}`
            ];

            if (download.get('audioOnly')) {
                args.unshift('-x')
            }

            const job = spawn('youtube-dl', args, { cwd: download.get('destinationPath') })

            download = download
                .set('ticker', ticker)
                .set('job', job) 
                .set('status', 1)

            job.stdout.on('data', (data) => {
                for (const line of data.toString().trim().split('\n')) {
                    this._handleDataLine(download.set('line', line))
                }
            })

            job.stderr.on('data', (err) => {
                console.error(err.toString())
                download.get('errors').push(err.toString())
                this._handleError(download, err.toString())
            })

            job.on('close', () => {
                done()
                download = download.set('status', 0)
                this._send('downloaded', download)
                this.downloads[handle] = download
                // delete this.downloads[handle]
            })

            this.downloads[handle] = download
        })
    }

    get downloadPipeline() {
        if (!this._downloadPipeline) {
            this._downloadPipeline = new Pipeline(4)
            this._downloadPipeline.onZero(() => {
                this._send('done')
            })
        }
        return this._downloadPipeline
    }

    _send(tag, payload) {
        this.emitter.emit(tag, payload.toObject())
    }

    _handleDataLine(download) {
        const description = this.descriptor.get(download.get('line'))

        if (!description) return

        // console.log(payload)
        this._send('payload', download.set('description', description))
    }

    _handleError(download, error) {
        this.emitter.emit('error', download.toObject(), error)
    }

    _createHandle(value) {
        return 'id-' + crypto.createHmac('sha256', 'secret')
            .update(value)
            .digest('hex')
            .substr(0, 10)
    }

    _informationValid(title, id, thumbnail, duration) {
        return !(
            typeof title     === 'undefined' ||
            typeof id        === 'undefined' ||
            typeof thumbnail === 'undefined' ||
            typeof duration  === 'undefined'
        )
    }

    _getInformation(url, onVideo) {
        // title     = WHAT IS LIFE BUT DEATH PENDING? - Part 1 - VAMPYR Let's Play Walkthrough Gameplay
        // id        = 3ckt5UfqgrM
        // thumbnail = https://i.ytimg.com/vi/3ckt5UfqgrM/maxresdefault.jpg
        // duration  = 1:37:25
        const yid = spawn(
            'youtube-dl',
            `--get-title --get-thumbnail --get-duration --get-id ${url}`.split(' ')
        )

        const chunker = createChunker(4, ([title, id, thumbnail, duration]) => {
            if (this._informationValid(title, id, thumbnail, duration))  {
                onVideo(null, { title, id, thumbnail, duration })
            }
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
        mkdirp(destinationPath, (err) => {
            if (!err) {
                this.downloadPipeline._maxCount = concurrent
                this._getInformation(
                    downloadId,
                    (err, video) => {
                        if (err) return

                        const handle = this._createHandle(video.id)

                        this.downloads[handle] = IMap({
                            errors: [],
                            status: 2,
                            handle,
                            concurrent,
                            destinationPath,
                            audioOnly,
                            description: {},
                            video,
                        })

                        console.log(this.downloads[handle])

                        this.downloadPipeline.push(handle)
                    }
                )
            } else {
                console.error(err.toString())
            }
        })
    }

    onQueue(callback) {
        this.downloadPipeline.onQueue(handle => {
            callback(this.downloads[handle].toObject())
        })
    }

    onDequeue(callback) {
        this.downloadPipeline.onDequeue(handle => {
            callback(this.downloads[handle].toObject())
        })
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
            this.completedDownloads = {}
            this.downloads = {}
        }
    },
    computed: {
        orderedDownloads() {
            return Object
                .values(this.downloads)
                .sort((left, right) => left.status > right.status)
        }
    },
    data: {
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
})

downloadManager.onQueue(download => {
    console.log('queue', download.handle)
    Vue.set(app.downloads, download.handle, download)
})

downloadManager.onDequeue(download => {
    console.log('dequeue', download.handle)
    Vue.set(app.downloads, download.handle, download)
})

downloadManager.onDownloaded(download => {
    Vue.set(app.downloads, download.handle, download)
    // downloadColumn.markDone(id)
})

downloadManager.onFailed(payload => {
    console.log(payload)
})

downloadManager.onDone(() => {
    console.log('done')
    // form.reset()
})
