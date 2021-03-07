import * as _ from 'lodash';
import { EventEmitter } from './event';
import {
  MappedDataRef,
  MetalDataRef,
  MetalFilterPersistentState,
  MetalModelRef,
  MetalModelRefs,
  MetalModelRefTranslation,
  ModelRefValue,
  WhereEqualFilter,
  WhereFilter
} from './interface';
import { MetalQuery } from './query';
import { MetalState, StateStore } from './state';
import { strToType } from './utils/converter';
import { decodeModelURI, encodeModelURI, filterRefMap, modelRefMap } from './utils/filter';

export class MetalFilterState<T> {
  public status: 'init' | 'ready' = 'init';
  public query: MetalQuery<T>;
  public model: MetalDataRef<T> = {};
  public modelRef: MetalModelRefs<T> = {};
  public modelRefs: MetalModelRef[] = [];
  public translations: MetalModelRefTranslation = {};

  public activeModelRefs: MappedDataRef[] = [];
  public activeFilterRefs: { [key: string]: string; } = {};
  public activeModelRefKeys: string[] = [];
  public encodedModelURI: string;

  public stateChange: EventEmitter<this> = new EventEmitter<this>();
  public activeModelChange: EventEmitter<MappedDataRef[]> = new EventEmitter<MappedDataRef[]>();
  public transformModelRefs: (ref: MetalModelRefs<T>, refs: MetalModelRef[]) => void;
  public transformActiveModelRefs: (refs: MappedDataRef[]) => void;

  public pushLocationStrategy: 'push' | 'replace' = 'replace';

  private _cache: MetalState<MetalFilterPersistentState<T>>;

  constructor(public parentQuery: MetalQuery<T>) {
    const { filters, collection, name } = parentQuery;
    const { filterRefs, limit } = filters;

    this.query = collection.query(`${name}.head`, {
      filterRefs, limit
    });

    this._cache = StateStore.get(`${this.query.href}.filter`);
    this.model = this.buildModels();
    this._buildModelRefs();
    this._readCaches();
  }

  public init(): this {
    const { model, activeModelRefKeys } = this._cache.data;

    if (model) {
      this.encodeModelURI();

      this.status = 'ready';
      this.pushLocationStrategy = 'push';
      this.stateChange.emit(this);
      this.activeModelChange.emit(this.activeModelRefs);

      if (!activeModelRefKeys.length) {
        this._fetchRefs();
      }
    } else {
      if (this.parentQuery.filters.where) {
        _.merge(this.model, this.parentQuery.filters.where);
      }

      this.buildActiveModelRefs();
      this._fetchRefs();
    }

    return this;
  }

  public set(key: string, value: WhereEqualFilter, apply?: boolean): this {
    _.set(this.model, key, value);

    if (apply) {
      return this.apply();
    } else {
      this.stateChange.emit(this);
    }

    return this;
  }

  public apply(reset = true): this {
    if (reset) {
      this.parentQuery.filters.page = 1;
    }

    this.buildActiveModelRefs();

    if (!this.activeModelRefs.length) {
      this.activeFilterRefs = {};
      this._applySelfMetas();
    }

    this._applyActiveFilterRefs();

    this.pushLocationStrategy = 'replace';
    this._writeCache();
    return this.fetch();
  }

  public remove(key: string): this {
    _.set(this.model, key, undefined);
    return this.apply();
  }

  public splice(key, value): this {
    key = `${key}.inq`;
    const values = _.get(this.model, key);

    if (Array.isArray(values)) {
      values.splice(values.indexOf(value), 1);

      if (!values.length) {
        _.set(this.model, key, undefined);
      }

      this.apply();
    }

    return this;
  }

  public clear(): this {
    for (const ref of this.activeModelRefs) {
      _.set(this.model, ref.key, undefined);
    }
    return this.apply();
  }

  public applyParentMetas() {
    const lastActiveKey: string = this.activeModelRefs.map(ref => ref.key).pop();

    if (this.parentQuery.meta && this.parentQuery.meta.filterRef) {
      const { filterRef } = this.parentQuery.meta;

      for (const ref of this.modelRefs) {
        if (lastActiveKey !== ref._path) {
          const values = filterRef[ref._path];

          if (values) {
            for (const val of (ref._values || [])) {
              if (values[val.value]) {
                val.count = values[val.value];
                createSuffix(val);
              } else {
                val.count = 0;
                delete val.suffix;
              }
            }
          } else {
            this._desuffixModelRefs(ref._values || []);
          }
        }
      }
    }

    this._buildActiveFilterRefs();
  }

  public encodeModelURI(refs?: MappedDataRef[]): this {
    const sourceRefs = [
      { key: 'page', value: this.parentQuery.filters.page },
      { key: 'limit', value: this.parentQuery.filters.limit },
      ...(refs || this._mapActiveModelRefs()),
    ];

    if (this.parentQuery.filters.search) {
      sourceRefs.push({
        key: 'search', value: this.parentQuery.filters.search
      });
    }

    this.encodedModelURI = encodeModelURI(sourceRefs);

    return this._exportActiveModelURI();
  }

  public decodeModelURI(uri?: string) {
    return decodeModelURI(uri);
  }

  public fetch(): this {
    const where: WhereFilter<T> = {};
    const refs = this._mapActiveModelRefs();

    for (const ref of refs) {
      if (ref.type === 'multiple') {
        _.set(where, `${ref.key}.inq`, ref.value);
      } else if (ref.type === 'range') {
        _.set(where, `${ref.key}.between`, ref.value);
      } else {
        _.set(where, ref.key, ref.value);
      }
    }

    this.parentQuery.where(where).fetch()
      .then(() => {
        this.pushLocationStrategy = 'push';
      })
      .catch(console.error);
    return this;
  }

  public buildModels(): MetalDataRef<T> {
    const model: MetalDataRef<T> = {};

    if (this.query.filters.filterRefs) {
      const refs = filterRefMap(this.query.filters.filterRefs);

      for (const ref of refs) {
        if (ref._type === 'multiple') {
          _.set(model, `${ref._path}.inq`, undefined);
        } else if (ref._type === 'range') {
          _.set(model, `${ref._path}.between`, undefined);
        } else {
          _.set(model, ref._path, undefined);
        }
      }
    }

    return model;
  }

  public buildActiveModelRefs(): this {
    const refs: MappedDataRef[] = this._mapActiveModelRefs();
    const keys: string[] = refs.map(ref => ref.key);

    for (const key of this.activeModelRefKeys) {
      if (!keys.includes(key)) {
        this.activeModelRefKeys.splice(this.activeModelRefKeys.indexOf(key), 1);
      }
    }

    for (const key of keys) {
      if (!this.activeModelRefKeys.includes(key)) {
        this.activeModelRefKeys.push(key);
      }
    }

    const orderedRefs: MappedDataRef[] = [];

    for (const key of this.activeModelRefKeys) {
      const ref = refs.filter(r => r.key === key);
      if (ref.length) {
        orderedRefs.push(ref[0]);
      }
    }

    this.encodeModelURI(orderedRefs);

    if (typeof this.transformActiveModelRefs === 'function') {
      this.transformActiveModelRefs(orderedRefs);
    }

    this.activeModelRefs = orderedRefs;
    this.stateChange.emit(this);
    this.activeModelChange.emit(this.activeModelRefs);

    return this;
  }

  private _fetchRefs() {
    this.query
      .head(true)
      .then(() => {
        this.status = 'ready';
        this.pushLocationStrategy = 'push';
        this.stateChange.emit(this);

        this._buildModelRefs();
        this._applySelfMetas();
        this.applyParentMetas();
        this._writeCache();
      })
      .catch(console.error);
  }

  private _writeCache() {
    const {
      model,
      modelRef,
      modelRefs,
      activeModelRefs,
      activeModelRefKeys,
      encodedModelURI,
      activeFilterRefs
    } = this;

    this._cache.set({
      model, modelRef, modelRefs, activeModelRefs, activeModelRefKeys, encodedModelURI, activeFilterRefs
    });
  }

  private _readCaches() {
    const {
      model = {},
      modelRef = {},
      modelRefs = [],
      activeModelRefs = [],
      activeModelRefKeys = [],
      encodedModelURI = '',
      activeFilterRefs = {}
    } = this._cache.data;

    if (model) {
      _.merge(this.model, model);
      _.merge(this.modelRef, modelRef);

      this.modelRefs.forEach((ref, i) => {
        for (const cref of modelRefs) {
          if (ref._path === cref._path) {
            this.modelRefs[i] = cref;
          }
        }
      });

      Object.assign(this, {
        activeModelRefs, activeModelRefKeys, encodedModelURI, activeFilterRefs
      });
    }
  }

  private _buildModelRefs(): this {
    if (this.query.filters.filterRefs) {
      const refs = filterRefMap(this.query.filters.filterRefs);

      for (const ref of refs) {
        _.set(this.modelRef, ref._path, { ...ref, _values: [] });
      }

      this.modelRefs = refs as MetalModelRef[];
    }

    if (typeof this.transformModelRefs === 'function') {
      this.transformModelRefs(this.modelRef, this.modelRefs);
    }

    this.stateChange.emit(this);
    return this;
  }

  private _buildActiveFilterRefs(): this {
    const refKey = this.activeModelRefs.map(ref => `${ref.key}=${ref.value}`).join('&');
    this.activeFilterRefs[refKey] = JSON.stringify(this.modelRefs);

    return this;
  }

  private _suffixModelRefs(values?: ModelRefValue[]): this {
    if (Array.isArray(values)) {
      for (const val of values) {
        if (val.count) {
          createSuffix(val);
        } else {
          delete val.suffix;
        }
      }
    } else {
      for (const ref of this.modelRefs) {
        if (Array.isArray(ref._values)) {
          this._suffixModelRefs(ref._values);
        }
      }
    }

    return this;
  }

  private _desuffixModelRefs(values?: ModelRefValue[]): this {
    if (Array.isArray(values)) {
      for (const val of values) {
        delete val.suffix;
      }
    } else {
      for (const ref of this.modelRefs) {
        this._desuffixModelRefs(ref._values);
      }
    }

    return this;
  }

  private _mapActiveModelRefs(): MappedDataRef[] {
    return modelRefMap(this.model)
      .map(({ key, value }) => {
        const ref: MetalModelRef = _.get(this.modelRef, key) || {};
        return { key, value, type: ref._type, label: ref._label };
      })
      .sort((a, b) => {
        return this.activeModelRefKeys.indexOf(a.key) - this.activeModelRefKeys.indexOf(b.key);
      });
  }

  private _applySelfMetas(): this {
    if (this.query.meta && this.query.meta.filterRef) {
      for (const [path, values] of Object.entries(this.query.meta.filterRef)) {
        const valueRefs = Object.keys(values).map(value => {
          return {
            value: strToType(value),
            count: values[value],
            label: (this.translations[value] || value),
          };
        });

        for (const ref of this.modelRefs) {
          if (ref._path === path) {
            ref._values = valueRefs.sort((a, b) => {
              return String(a.label).localeCompare(String(b.label));
            });
            _.set(this.modelRef, path, { ...ref });
          }
        }
      }

      this._suffixModelRefs();
    }

    return this;
  }

  private _applyActiveFilterRefs(): this {
    const refKey = this.activeModelRefs.map(ref => `${ref.key}=${ref.value}`).join('&');
    if (this.activeFilterRefs[refKey]) {
      this.modelRefs = JSON.parse(this.activeFilterRefs[refKey]);
      for (const ref of this.modelRefs) {
        _.set(this.modelRef, ref._path, ref);
      }
    }

    return this;
  }

  private _exportActiveModelURI(): this {
    const method = this.pushLocationStrategy === 'replace' ? 'replaceState' : 'pushState';
    const state = {
      name: 'metal-filter',
    };

    if (this.encodedModelURI) {
      history[method](state, '', `${location.pathname}?${this.encodedModelURI}`);
    } else {
      history[method](state, '', location.pathname);
    }

    return this;
  }
}

function createSuffix(value: ModelRefValue, optClass?: string): void {
  if (value.count) {
    optClass = optClass ? `facet-count ${optClass}` : 'facet-count';
    value.suffix = `&nbsp;<strong class="${optClass}">(${value.count.toLocaleString()})</strong>`;
  } else {
    delete value.suffix;
  }
}
