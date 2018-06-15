const P = require('parsimmon')

class Descriptor {
    constructor() {
        const unknown = /Unknown|unknown/
        const number = /(~{0,1}\d+\.\d+)/
        const unit = /KiB|MiB|GiB/
        const size = new RegExp(`(Unknown|${number.source}KiB|${number.source}MiB|${number.source}GiB)`)
        const speed = new RegExp(`(${size.source}/s|${unknown.source}\\s+size)`)
        const percent = new RegExp("\d{1,3}\.\d%|100%")
        const t = new RegExp(`\\[download\\]\\s+(${percent.source})\\s+of\\s+(${size.source})\\s+at\\s+(${speed.source})`)


        // 95.7% of 1.40GiB at Unknown speed ETA Unknown ETA
        this.language = P.createLanguage({
            Warning: (r) => P.seqMap(
                P.string('WARNING: '),
                P.regex(/.+$/),
                (_, w) => w
            )
                .desc('Warning')
                .node('warning'),
            Destination: (r) => P.seqMap(
                P.string('Destination: '),
                P.regex(/.+/),
                (_, r) => r
            )
                .desc('Destination')
                .node('destination'),
            Deleting: (r) => P.seqMap(
                P.string('Deleting '),
                P.regex(/.+$/),
                (_, d) => d
            )
                .desc('Deleting')
                .node('deleting'),
            Tag: (r) => P.alt(
                P.string("download"),
                P.string("youtube"),
                P.string("ffmpeg"),
                P.string("dashsegments")
            )
                .wrap(P.string("["), P.string("]"))
                .desc('Tag')
                .node('tag'),
            ID: (r) => P.regex(/[a-zA-Z0-9]+:\s+/)
                .desc('ID')
                .node('id'),
            Perc: (r) => P.regex(/\d{1,3}\.\d%|100%/)
                .desc('Percent')
                .node('percentComplete'),
            Numb: (r) => P.regex(/~{0,1}\d+\.\d+/)
                .desc('Number'),
            Unit: (r) => P.regex(/KiB|MiB|GiB|PiB/)
                .desc("Unit"),
            Size: (r) => P.seqMap(
                r.Numb,
                r.Unit,
                (n, u) => `${n}${u}`
            )
                .desc('Size')
                .node('size'),
            Speed: (r) => P.alt(
                P.seqMap(
                    r.Size,
                    P.string('/s'),
                    (s, _) => `${s.value}/s`
                ),
                P.string('Unknown speed')
            )
                .node('speed'),
            Filler: (r) => P.alt(
                P.string('of'),
                P.string('at'),
                P.string('in')
            ),
            Time: (r) => P.alt(
                P.regex(/\d{2}:\d{2}:\d{2}/),
                P.regex(/\d{2}:\d{2}/)
            )
                .desc('Time')
                .node('time'),
            Eta: (r) => P.alt(
                P.string('ETA Unknown ETA'),
                P.seqMap(
                    P.regex(/ETA\s+/),
                    r.Time,
                    (_, t) => `${t.value}`
                )
            )
                .desc('ETA')
                .node('eta'),
            Expression: (r) => P.alt(
                r.ID,
                r.Deleting,
                r.Warning,
                r.Tag,
                r.Destination,
                r.Perc,
                r.Speed,
                r.Size,
                r.Eta,
                r.Filler,
                P.whitespace,
                r.Time
            ),
            Desc: (r) => r.Expression.trim(P.optWhitespace).many()
        })

    }

    get(value) {

        try {
            const data = this.language.Desc.tryParse(value),
                output = {}

            // console.log(data)
            for (const datom of data) {
                if (typeof datom === 'object' && 'name' in datom) {
                    output[datom.name] = datom.value
                }
            }

            // console.log(value, data)
            return output

        } catch (e) {
            // console.log(value)
            // console.log(e)
            return null
        }
    }
}

module.exports = Descriptor