import * as _ from 'lodash';
import {
  MappedDataRef,
  MappedFilterRefs,
  MetalDataRef,
  MetalQueryFilterRefs,
  MetalQueryFilters,
  WherePredicateConditionKeys
} from '../interface';
import { strToType } from './converter';
import { typeOf } from './typeof';

export function filterRefMap<T>(refs: MetalQueryFilterRefs<T>): MappedFilterRefs[] {
  const mappedRefs: MappedFilterRefs[] = [];

  for (const [key, value] of Object.entries(refs) as any) {
    if (typeOf(value) === 'object') {
      if (value._type) {
        const { _type, _label, _required, _exclude } = value as any;
        mappedRefs.push({ _type, _label, _required, _exclude, _path: key });
      }

      const subRefs = filterRefMap(value as any);
      if (subRefs.length) {
        mappedRefs.push(...subRefs.map(({ _type, _path, _label, _required, _exclude }) => {
          return { _type, _label, _required, _exclude, _path: `${key}.${_path}` };
        }));
      }
    }
  }

  return mappedRefs;
}

export function modelRefMap<T>(refs: MetalDataRef<T>, falsy?: boolean): MappedDataRef[] {
  const mappedRefs: MappedDataRef[] = [];

  for (const [key, value] of Object.entries(refs)) {
    if (typeOf(value) === 'object') {
      const subRefs = modelRefMap(value).map(ref => {
        if (WherePredicateConditionKeys.includes(ref.key)) {
          return { key, value: ref.value };
        } else {
          return { key: `${key}.${ref.key}`, value: ref.value };
        }
      });

      if (subRefs.length) {
        mappedRefs.push(...subRefs);
      }
    } else {
      if (typeOf(value) === 'object' || typeOf(value) === 'array') {
        if (!_.isEmpty(value) || falsy) {
          mappedRefs.push({ key, value });
        }
      } else {
        if ((typeof value !== 'undefined' && value !== null) || falsy) {
          mappedRefs.push({ key, value });
        }
      }
    }
  }

  return mappedRefs;
}

export function encodeModelURI(refs: MappedDataRef[]): string {
  return refs
    .map(ref => {
      if (ref.type === 'multiple') {
        return `${ref.key}=[${ref.value.join(',')}]`;
      } else if (ref.type === 'range') {
        return `${ref.key}=${ref.value.map(val => `<${val}>`).join('')}`;
      } else {
        return `${ref.key}=${ref.value}`;
      }
    })
    .join('&');
}

export function decodeModelURI(uri: string): MappedDataRef[] {
  return uri
    .split('&')
    .filter(segment => segment)
    .map(segment => {
      const [key, value] = segment.split('=');

      if (value.startsWith('~')) {
        // Compatibility with the old array filter format.
        return {
          key: `${key}.inq`,
          type: 'multiple',
          value: value.replace(/^~/, '').split(/\s?,\s?/).map(v => strToType(v))
        };
      } else if (value.startsWith('[') && value.endsWith(']')) {
        return {
          key: `${key}.inq`,
          type: 'multiple',
          value: value.replace(/^\[/, '').replace(/]$/, '').split(/\s?,\s?/).map(v => strToType(v))
        };
      } else if (value.startsWith('<') && value.endsWith('>')) {
        return {
          key: `${key}.between`,
          type: 'range',
          value: value.replace(/^</, '').replace(/>$/, '').split('><')
        };
      } else {
        return {
          key,
          type: 'single',
          value: strToType(value)
        };
      }
    });
}

export function decodeModelURIFromURL(url?: string): MappedDataRef[] {
  const decodedURI = decodeURI(url || location.search.replace(/^\?/, ''));
  return decodeModelURI(decodedURI);
}

export function decodeFiltersFromURL<T>(url?: string): MetalQueryFilters<T> {
  const refs = decodeModelURIFromURL(url);
  const filters: MetalQueryFilters<T> = {};

  for (const ref of refs) {
    if (['page', 'limit', 'search'].includes(ref.key)) {
      _.set(filters, ref.key, ref.value);
    } else {
      _.set(filters, `where.${ref.key}`, ref.value);
    }
  }

  return filters;
}
