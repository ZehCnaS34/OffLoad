// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const {ipcRenderer} = require('electron')
require('./components')

const $app = document.getElementById('app')
const $content = document.getElementById('content')
window.$app = $app
window.$content = $content

$app.style.height = `${window.innerHeight}px`

window.onresize = function () {
    $app.style.height = `${window.innerHeight}px`
}

// const downloadManager = new DownloadManager()

const app = new Vue({
    el: '#app',
    methods: {
        download() {
            const { downloadId, destinationPath, audioOnly, concurrent } = this;
            ipcRenderer.send('download', { downloadId, destinationPath, audioOnly, concurrent })
            this.downloadId = '';
            this.destinationPath = '';
        },
    },
    computed: {
        downloading() {
            return Object.values(this.downloads)
                .filter(download => download.status === 'downloading')
        },
        queued() {
            return Object.values(this.downloads)
                .filter(download => download.status === 'queued')
        },
        done() {
            return Object.values(this.downloads)
                .filter(download => download.status === 'done')
        }
    },
    data: {
        audioOnly: false,
        downloadId: 'https://www.youtube.com/watch?v=S0QPK9yc2-s&list=PLj_Goi54wf0esy4JFDk2ix5Y5-es-S6R0',
        destinationPath: '/home/alex/Videos/Christopher Odd/Dragon Age Inquisition',
        formats: ['mp4'],
        format: 'mp4',
        concurrent: 4,
        count: 0,
        completed: 0,
        active: 0,
        downloads: {},
    }
})

ipcRenderer.on('payload', (event, payload) => {
    Vue.set(app.downloads, payload.handle, payload)
})
