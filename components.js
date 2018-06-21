Vue.component('download', {
    props: ['download'],
    template: `
        <div class="download">
            <div class="thumbnail">
                <img :src="download.video.thumbnail" />
                <div class="overlay">
                    <span>{{download.description.eta}}</span>
                </div>
            </div>
            <slot></slot>
            <p class='title'>{{download.video.title}}</p>
            <p class='error bottom' v-for="error in download.errors">{{error}}</p>
        </div>
    `
})

function CommonProp(name, options) {
    Vue.component(name, {
        ...options,
        props: [
            ...(options.props || []), 
            'flx-one'
        ]
    })
}

CommonProp('flex', {template: `<input />`})
CommonProp('e-flex', {template: `<div style="display: flex;"><slot /></div>`})

Vue.component('checkbox', {
    props: ['value', 'on', 'off', 'className'],
    template: `
        <button :class='className' v-if="value" v-on:click="$emit('input', false)">{{on||'on'}}</button>
        <button :class='className' v-else v-on:click="$emit('input', true)">{{off||'off'}}</button>
    `
})

Vue.component('config-form', {
    data() {
        return {
            downloadId: 'https://www.youtube.com/watch?v=1ySsmWxP6V4&list=PLs1-UdHIwbo457LKIIh0JUdH2GXw3EVA1',
            destinationPath: '/mnt/Drive/Videos/The Rad Brad/Resident Evil 6',
            audioOnly: false,
            concurrent: 4,
            concurrentOptions: [2, 4, 8, 16, 32],
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
                concurrent: parseInt(this.concurrent)

            })
        }
    },
    template: `
        <div id="config">
            <e-text
                className="blk"
                :disabled="busy"
                label="Download URL"
                v-model="downloadId"
                />
            <e-text
                :disabled="busy"
                label="Download Destination"
                v-model="destinationPath" />
            <flex>
                <e-checkbox
                    className='flex-1'
                    yes='Audio Only'
                    no='Audio Only'
                    :disabled="busy"
                    label="Audio Only"
                    v-model="audioOnly" />
                <e-select
                    className='flex-1'
                    :disabled="busy"
                    label="Download Type"
                    v-bind:options="downloadTypes"
                    v-model="downloadType" />
                <flex className="flex-1">
                    <e-slider className="edl-form-group-item" v-model='concurrent' />
                    <e-text v-model="concurrent" />
                </flex>
            </flex>
            <flex v-if="busy">
                <button id="edl" class="edl flex-1" v-on:click="stop()">stop</button>
            </flex>
            <flex v-else>
                <button id="start-btn" class="edl btn flex-1" v-on:click="start()">start</button>
            </flex>
                <button id="start-btn" class="edl btn flex-1" v-on:click="start()">start</button>
        </div>
    `
})
