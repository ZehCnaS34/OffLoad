function div({classList:[]}) {
    const d = document.createElement('div')
    for (const className of classList) {
        d.classList.add(className)
    }
    return d
}

class View {
    constructor() {
        this.$container = div({classList: ['cols']})
    }
    
    _draw() {
    }
}
