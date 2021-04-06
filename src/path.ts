import { MetalCollection } from './collection';
import { MetalRecord } from './record';

export interface MetalPathSegment {
  path: string;
  prefix?: string;
  suffix?: string;
}

export class MetalPath {
  public segments: MetalPathSegment[] = [];
  public url: string;

  constructor(base: MetalRecord<any> | MetalCollection<any>, ...parents: Array<MetalRecord<any> | MetalCollection<any>>) {
    this.prepend(base);
    this.belongsTo(...parents);
  }

  public append(segment: MetalRecord<any> | MetalCollection<any>): this {
    if (segment instanceof MetalRecord) {
      this.append(segment.collection);
      this.segments.push({ path: segment.id });
    } else if (segment instanceof MetalCollection) {
      const { endpoint: path, endpointPrefix: prefix } = segment.configs;
      this.segments.push({ path, prefix });
    }

    return this.capture();
  }

  public prepend(segment: MetalRecord<any> | MetalCollection<any>): this {
    if (segment instanceof MetalRecord) {
      this.segments.splice(0, 0, { path: segment.id });
      this.prepend(segment.collection);
    } else if (segment instanceof MetalCollection) {
      const { endpoint: path, endpointPrefix: prefix } = segment.configs;
      this.segments.splice(0, 0, { path, prefix });
    }

    return this.capture();
  }

  public belongsTo(...segments: Array<MetalRecord<any> | MetalCollection<any>>): this {
    segments.forEach(segment => this.prepend(segment));
    return this;
  }

  public capture(): this {
    const segments: string[] = this.segments.map(({ path }) => path);

    if (this.segments[0].prefix) {
      segments.splice(0, 0, this.segments[0].prefix);
    }

    this.url = segments.join('/').replace(/\/\//g, '/');

    return this;
  }
}
