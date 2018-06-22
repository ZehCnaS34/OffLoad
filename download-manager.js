const { spawn } = require('child_process')
const mkdirp = require('mkdirp')
const EventEmitter = require('events')
const crypto = require('crypto')
const Descriptor = require('./descriptor')
const Pipeline = require('./pipeline')

const DOWNLOADING = 'downloading',
    WAITING = 'queued',
    DONE = 'done'

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

class DownloadManager {
    constructor() {
        this.descriptor = new Descriptor()
        this.emitter = new EventEmitter()
        this.downloads = {}

        this._downloadPipeline = null

        this.downloadPipeline.onValue(this._startDownload.bind(this))
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

    _startDownload({ done, ticker }, handle)  {
        // {video, audioOnly, destinationPath}
        // const handle = this.createHandle(download.video.title)
        let download = this.downloads[handle]
        const args = [
            '--newline',
            '-o',
            `%(title)s.%(ext)s`,
            `https://youtube.com/watch?v=${download.video.id}`
        ];

        if (download.audioOnly) {
            args.unshift('-x')
            // args.unshift('m4a')
            // args.unshift('-f')
        } else {
            args.unshift('mp4')
            args.unshift('-f')
        }

        const job = spawn('youtube-dl', args, { cwd: download.destinationPath })

        download.ticker = ticker
        download.job    = job
        download.status = DOWNLOADING

        job.stdout.on('data', (data) => {
            for (const line of data.toString().trim().split('\n')) {
                download.line = line
                this._handleDataLine(download)
            }
        })

        job.stderr.on('data', (err) => {
            console.error(err.toString())
            download.errors.push(err.toString())
            this._handleError(download, err.toString())
        })

        job.on('close', () => {
            done()
            download.status = DONE
            this._send('downloaded', download)
            this.downloads[handle] = download
            // delete this.downloads[handle]
        })

        this.downloads[handle] = download
    }

    _send(tag, payload) {
        this.emitter.emit(tag, payload)
    }

    _handleDataLine(download) {
        const description = this.descriptor.get(download.line)

        if (!description) {
            console.log(download.line)
            return
        }

        // console.log(payload)
        download.description = description
        this._send('payload', download)
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
        concurrent,
        format = 'mp4',
    }) {
        mkdirp(destinationPath, (err) => {
            if (!err) {
                this.downloadPipeline._maxCount = concurrent
                this._getInformation(
                    downloadId,
                    (err, video) => {
                        if (err) return

                        const handle = this._createHandle(video.id)

                        this.downloads[handle] = {
                            errors: [],
                            status: WAITING,
                            format,
                            handle,
                            concurrent,
                            destinationPath,
                            audioOnly,
                            description: {},
                            video,
                        }

                        // console.log(this.downloads[handle])

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
            callback(this.downloads[handle])
        })
    }

    onDequeue(callback) {
        this.downloadPipeline.onDequeue(handle => {
            callback(this.downloads[handle])
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
	    this.downloads[handle].job.stdin.pause();
	    this.downloads[handle].job.kill();
	    delete this.downloads[handle]
	}
    }
}

module.exports = DownloadManager
