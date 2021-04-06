import { MetalCollection } from './collection';
import { MetalOrigin } from './origin';
import { MetalQuery } from './query';
import { MetalQueue } from './queue';
import { MetalDataList, MetalRecord, MetalRecordList } from './record';
import { MetalTransaction } from './request';

// tslint:disable-next-line:no-empty-interface
export interface Optional {}

export interface MetalFilterRef {
  [key: string]: {
    [value: string]: number;
  };
}

export type ItemTypeOf<T> = T extends (infer U)[] ? U : never;
export type MetalQueryFilterRefType = 'single' | 'multiple' | 'input' | 'range' | string;

export interface MetalQueryFilterRef {
  _type: MetalQueryFilterRefType;
  _label?: string;
  _required?: boolean;
  _exclude?: boolean;
}

export type MetalQueryFilterRefs<T> = {
  [K in keyof T]?: MetalQueryFilterRef | MetalQueryFilterRefs<T[K]> | MetalQueryFilterRefs<ItemTypeOf<T[K]>>;
};
export type MetalDataMeta<M = Optional> = {
  limit: number;
  totalPages: number;
  totalRecords: number;
  filterRef?: MetalFilterRef;
  prevPage?: number;
  currentPage: number;
  nextPage?: number;
} & M;

export interface MetalDataListing<T> {
  data: T[];
  meta: MetalDataMeta;
}

export type WhereFilter<T> = WhereConditionFilter<T> | WhereConditionFilter<T>[];
export type WhereConditionFilter<T> = {
  [K in KeyOf<T>]?: (T[K] | WhereEqualFilter) |
  WherePredicateCondition<T[K]> |
  WherePredicateCondition<T[K]>[] |
  WhereFilter<T[K]>;
};
export type WhereEqualFilter = string | number | boolean | Date;
export type KeyOf<T> = Extract<keyof T, string>;
export const WherePredicateConditionKeys = [
  'gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'inq', 'nin',
  'between', 'exists', 'like', 'nlike', 'ilike', 'nilike', 'regexp'
];

export interface WherePredicateCondition<T> {
  gt?: T;
  gte?: T;
  lt?: T;
  lte?: T;
  eq?: T;
  neq?: T;
  inq?: T[];
  nin?: T[];
  between?: [T, T];
  exists?: boolean;
  like?: T;
  nlike?: T;
  ilike?: T;
  nilike?: T;
  regexp?: string | RegExp;
}

export type OrderBy<T> = {
  [K in keyof T]?: 'asc' | 'desc'
} | KeyOf<T>;
export type Fields<T> = Array<KeyOf<T> | { [K in keyof T]?: Fields<T[K]> | Fields<ItemTypeOf<T[K]>> }>;

export type MetalTransactionState = 'init' | 'running' | 'complete' | 'failed';
export type HttpRequestHandler<T> = (configs: MetalRequestConfig) => Promise<T>;
export type MetalMiddlewareCursor = () => void | Promise<void>;
export type MetalTransactionMiddleware<T> = (trx: MetalTransaction<T>, next: MetalMiddlewareCursor) => void | Promise<void>;

export interface MetalRequestHeaders {
  [key: string]: string | boolean | number;
}

export interface MetalRequestReferrer {
  record?: MetalRecord<any>;
  query?: MetalQuery<any>;
  collection?: MetalCollection<any>;
  meta?: MetalDataMeta;
}

export type MetalRequestOptions<O = Optional, P = Optional> = {
  prefix?: string;
  suffix?: string;
  headers?: MetalRequestHeaders;
  params?: MetalRequestParams<P>;
  payload?: any;
  referrer?: MetalRequestReferrer;
  delay?: number;
  browse?: boolean;
  reSync?: boolean;
} & O;

export interface MetalURLSegment {
  type: 'collection' | 'record';
  path: string;
  collection?: string;
  prefix?: string;
}

export type MetalRequestParam = string | number | boolean | Date | object | Array<any>;
export type MetalRequestParams<P = Optional> = {
  where?: WhereFilter<any>;
  search?: string;
  orderBy?: OrderBy<any>;
  fields?: Fields<any>;
  excludeFields?: Fields<any>;
  filterRefs?: MetalQueryFilterRefs<any>;
  page?: number;
  limit?: number;
} & P;
export type MetalRequestMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export interface MetalQueryFilters<T> {
  page?: number;
  limit?: number;
  search?: string;
  where?: WhereFilter<T>;
  orderBy?: OrderBy<T>;
  params?: MetalRequestParams;

  fields?: Fields<T>;
  excludeFields?: Fields<T>;
  filterRefs?: MetalQueryFilterRefs<T>;
}

export type MetalQueryStatus = 'init' | 'ready' | 'sync';
export type MetalSyncMethod = 'init' | 'update' | 'insert';

export interface MetalQueryPersistentCache<T> {
  data: T[];
  meta: MetalDataMeta;
  filters: MetalQueryFilters<T>;
}

export interface MetalQueryLocalCaches<T> {
  [filter: string]: {
    transaction: MetalTransaction<MetalDataListing<T>>;
    records: MetalRecordList<T>;
  };
}

export interface MetalQueryOptions extends MetalRequestOptions {
  persistentCache?: boolean;
  memoryCache?: boolean;
  syncDelay?: number;
}

export type RealtimeEventType =
  'post'
  | 'get'
  | 'put'
  | 'patch'
  | 'delete'
  | 'options'
  | 'subscribe'
  | 'unsubscribe'
  | 'touch';

export interface RealtimeEvent<T> {
  type: RealtimeEventType;
  path: string;
  filters?: WhereFilter<T>;
  data?: T;
  referer?: RealtimeEvent<any>;
}

export interface MetalQueryQueueMeta<T> extends MetalDataMeta {
  records: MetalDataList<T>;
}

export type MetalQueryQueue<T> = MetalQueue<MetalQueryQueueMeta<T>>;

export interface MetalOrigins {
  [name: string]: MetalOrigin;
}

export interface MetalDriverConfig {
  name?: string;
  queueLimit?: number;
  persistentCache?: boolean;
  memoryCache?: boolean;
  syncDelay?: number;
  global?: boolean;
}

/**
 * Base interface to be extended, to make sure the typings are correct.
 */
export interface MetalData {
  id?: string;
}

export type MetalPartialData<T extends MetalData> = {
  [K in keyof T]?: T[K] | MetalPartialData<T[K]>;
};
export type MetalRecordState = 'init' | 'ready' | 'sync';
export type MetalOriginConfig<C = Optional> = C & {
  name: string;
  baseURL: string;
  socketURL?: string;
  headers?: MetalRequestHeaders;
  defaultLimit?: number;
  persistentCache?: boolean;
  memoryCache?: boolean;
  syncDelay?: number;
  schemaValidation?: 'strict' | 'typings';

  keepTransactions?: boolean;
  slowNetworkSimulation?: boolean;
};

export interface MetalActiveRequests {
  [key: string]: MetalTransaction<any>;
}

export type MetalFindOptions<T, M = Optional> = MetalRequestOptions & {
  fields?: Fields<T>;
  excludeFields?: Fields<T>;
  meta?: MetalDataMeta<M>;
};

/**
 * A list of schema definitions.
 */
export type SchemaDefinitions<T> = {
  [K in keyof T]: SchemaDefinition | SchemaDefinitions<T[K]> | SchemaDefinitions<ItemTypeOf<T[K]>>;
};

/**
 * Schema definition to tell the validator how to process the data.
 */
export interface SchemaDefinition {
  /** Expected value type of the property. **/
  _type: 'string' | 'date' | 'number' | 'object' | 'array' | 'boolean' | 'enum';
  _enums?: Array<string | number>;
  /** Tell the validator that the property is required and must be defined. **/
  _required?: boolean;
  /** Tell the validator that the required property must be defined from the remote data, but ignored for the outgoing data. **/
  _generated?: boolean;
  /** Minimum value for number, minimum length for string. **/
  _min?: number;
  /** Maximum value for number, maximum length for string. **/
  _max?: number;
  /** Value to be set to the property if not defined by user. **/
  _default?: any | valueMaker;
}

/**
 * Function to create a default value, and giving a data as a reference when calling the function.
 */
export type valueMaker = (data: any) => any;

/**
 * Schema validation result.
 */
export interface SchemaValidation {
  _valid: boolean;
  _expected?: string | number;
  _given?: any;
  _message?: string;
  _value?: any;
}

export type SchemaValidations<T> = {
  [K in keyof T]: SchemaValidation & SchemaValidations<T[K]>;
} & SchemaValidation;

export interface ItemSchemaValidations<T> extends Array<SchemaValidations<T>> {
  _valid: boolean;
}

export type MetalCollectionConfig<T, C = Optional> = {
  name: string;

  endpoint: string;
  endpointPrefix?: string;
  filterRefs?: MetalQueryFilterRefs<T>;

  relations?: MetalRelation;
  defaultLimit?: number;
  headers?: { [key: string]: any };
  schemas?: SchemaDefinitions<T>;
  strict?: boolean;
  noPatch?: boolean;
  persistentCache?: boolean;
  memoryCache?: boolean;
  syncUpdate?: boolean;
  syncDelay?: number;
} & C;

export interface MetalBelongsToRelation {
  name: string;
  foreignKey: string;
}

export interface MetalHasOneRelation {
  name: string;
  localKey: string;
}

export interface MetalHasManyRelation {
  name: string;
  localKey: string;
}

export interface MetalRelation {
  belongsTo?: MetalBelongsToRelation[];
  hasOne?: MetalHasOneRelation[];
  hasMany?: MetalHasManyRelation[];
}

export interface MetalQueriesState<T, C extends MetalCollection<T>> {
  [name: string]: MetalQuery<T, C>;
}

export interface MetalRecordsState<T, C extends MetalCollection<T>> {
  [id: string]: MetalRecord<T, C>;
}

export interface ModelRefValue {
  value: string;
  count: number;
  prevCount?: number;
  label?: string;
  suffix?: string;
}

export type MetalDataRef<T> = {
  [K in keyof T]?: T[K] & MetalDataRef<T[K]> & WherePredicateCondition<T[K]>;
};

export interface MappedFilterRefs {
  _type: MetalQueryFilterRefType;
  _path: string;
  _label?: string;
  _required?: boolean;
  _exclude?: boolean;
}

export interface MappedDataRef {
  key: string;
  value: any;
  type?: MetalQueryFilterRefType;
  label?: string;
}

export interface MetalModelRef extends MappedFilterRefs {
  _values: ModelRefValue[];
}

export type MetalModelRefs<T> = {
  [K in keyof T]?: MetalModelRef | MetalModelRefs<T[K]> | MetalModelRefs<ItemTypeOf<T[K]>>;
};

export interface MetalModelRefTranslation {
  [key: string]: string;
}

export interface MetalFilterPersistentState<T> {
  model: MetalDataRef<T>;
  modelRef: MetalModelRefs<T>;
  modelRefs: MetalModelRef[];
  activeModelRefs: MappedDataRef[];
  activeModelRefKeys: string[];
  encodedModelURI: string;
  activeFilterRefs: {
    [key: string]: string
  };
  parentFilterRefs?: string;
}

export interface MetalQueueStoreConfig {
  name?: string;
  limit?: number;
  timeout?: number;
}

export type MetalQueueStatus = 'idle' | 'running' | 'complete' | 'failed';
export type MetalQueueHandler<T> = (queue: MetalQueue<T>) => void;
export type MetalPartialQueueData<T> = {
  [K in keyof T]?: T[K] | MetalPartialQueueData<T[K]>;
};

export type PartialState<T> = {
  [K in keyof T]?: T[K] | PartialState<T[K]>;
};

export interface MetalRequestConfig {
  url: string;
  method: MetalRequestMethod;
  params?: MetalRequestParams;
  headers?: MetalRequestHeaders;
  data?: any;
}

export interface MetalResponse<D> {
  data: D;
  status: number;
  statusText: string;
  headers: MetalRequestHeaders;
}
