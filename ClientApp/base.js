import * as util from './util.js';

export let components = new class Components {
    constructor() {
        this._containers = new Array();
    }

    async resolve(args) {
        let container = this._containers.filter(c => c.key == args.key)[0];
        return (container ?? await this.register(args)).element;
    }

    async register(args) {
        let { key, component } = args;
        component = component ?? key;

        let container = this._containers.filter(c => c.key == key)[0];
        if (!container) {
            let resource = await this.loadResource('components', component);
            let element = new resource.component(resource.template, resource.model);

            container = { key: key, element: element };
            this._containers.push(container);
        }
        return container;
    }

    async loadResource(source, file) {
        return await import(`./${source}/${file}.js${util.version()}`);
    }
}

export let routers = new class Routers {
    constructor() {
        this._containers = new Array();
    }
    
    resolve(args) {
        let router = this._containers.filter(r => r.key == args.key)[0] ?? args;
        return router ?? this.register(router);
    }

    register(args) {
        let { key, component } = args;
        component = component ?? key;

        let router = this._containers.filter(r => r.key == key)[0];
        if (!router) {
            router = { key: key, component: component };
            this._containers.push(router);
        }
        return router;
    }
}

if (!customElements.get('app-view')) {
    customElements.define('app-view', class extends HTMLElement {
        constructor() {
            super();
        }

        async setComponent(key) {
            let component = await components.resolve({ key: key });
            this.innerHTML = "";
            this.appendChild(component);
        }

        async connectedCallback() {
            let key = this.getAttribute(`key`);
            if (key) {
                await this.setComponent(key);
            }
        }
    });
}

export class baseComponent extends HTMLElement {
    constructor(template, model) {
        super();
        this._setup = {};
        this.innerHTML = template();
        this.buildModel(model());
        this._init = false;
    }

    async connectedCallback() {
        if (!this._init) {
            this.bindRouter();
            this.bindEvents();
            this.dispatchEvent(new CustomEvent("load"));
            this._init = true;
        }
    }

    get model() { return this._model; }
    set model(value) {
        for (let field in value) {
            Reflect.set(this._model, field, value[field]);
        }
    }

    buildModel(data) {
        let context = this.querySelector("[data-model-context]");
        if (context) {
            this.querySelectorAll("[data-model-prop][data-model-field]").forEach(x => {
                let field = x.dataset.modelField;
                let prop = x.dataset.modelProp;
                this._setup[field] = this._setup[field] ?? { state: null, elements: new Array() };
                this._setup[field].state = data[field];
                this._setup[field].elements.push({ element: x, property: prop });
                x.addEventListener("change", (e) => {
                    this._setup[field].state = e.currentTarget[prop];
                    this.model[field] = this._setup[field].state;
                });
            });
        }

        Reflect.set(data, "_setup", this._setup);

        this._model = new Proxy(data, {
            get: function (obj, prop) {
                return obj[prop];
            },
            set: function (obj, prop, value) {
                obj[prop] = value;
                obj._setup[prop].state = obj[prop];
                obj._setup[prop].elements.forEach(x => {
                    x.element[x.property] = value;
                });
                return true;
            }
        });
    }

    bindRouter() {
        this.querySelectorAll(`a[data-router-view][href]`).forEach(x => {
            x.addEventListener('click', async (e) => {
                e.preventDefault();
                const { target } = e;

                let route = target.getAttribute('href');
                let view = target.getAttribute('data-router-view');

                let router = routers.resolve({ key: route });

                let appview = document.querySelector(`app-view#${view}`);
                await appview.setComponent(router.component);

                history.pushState({}, "", router.key);
            });
        });
    }
}