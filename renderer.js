// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const {ipcRenderer} = require('electron')

require('./components')

Vue.filter('parseFloat', function (value) {
    let v = parseFloat(value) || 100
    return v
})


const $app = document.getElementById('app')
const $content = document.getElementById('content')
window.$app = $app
window.$content = $content

$app.style.height = `${window.innerHeight}px`

window.onresize = function () {
    console.log('resizing')
    $app.style.height = `${window.innerHeight}px`
}

// const downloadManager = new DownloadManager()

const app = new Vue({
    el: '#app',
    methods: {
        download({ downloadId, destinationPath, audioOnly, concurrent }) {
            console.log(downloadId, destinationPath, audioOnly, concurrent)
            ipcRenderer.send('download', { downloadId, destinationPath, audioOnly, concurrent })
        },
    },
    computed: {
        orderedDownloads() {
            return Object
                .values(this.downloading)
                .sort((left, right) => left.status > right.status)
        }
    },
    data: {
        audioOnly: true,
        downloadId: '',
        destinationPath: '',
        count: 0,
        completed: 0,
        active: 0,
        threadCount: 4,
        downloading: {
            "asdifjas": {
                video: {
                    title: "hi"
                }
            }
        },
        queue: {},
        done: {}
    }
})


ipcRenderer.on('payload', (event, arg) => {
})

// downloadManager.onPayload((download) => {
//     if (download.description) {
//         Vue.set(app.downloading, download.handle, download)
//     }
// })

// downloadManager.onError((download, error) => {
// })

// downloadManager.onQueue(download => {
//     app.count += 1
//     Vue.set(app.queue, download.handle, download)
// })

// downloadManager.onDequeue(download => {
//     Vue.delete(app.queue, download.handle)
//     Vue.set(app.downloading, download.handle, download)
// })

// downloadManager.onDownloaded(download => {
//     app.completed += 1
//     Vue.delete(app.downloading, download.handle)
//     Vue.set(app.done, download.handle, download)
//     // downloadColumn.markDone(id)
// })

// downloadManager.onFailed(payload => {
//     console.log(payload)
// })

// downloadManager.onDone(() => {
//     console.log('done')
//     // form.reset()
// })
