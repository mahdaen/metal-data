import { drivers } from './driver';
import { MetalQuery } from './query';

const knownQueries: { [key: string]: MetalQuery<any> } = {};

/**
 * A Query getter.
 * @param name - A formatted query name with "ORIGIN:COLLECTION.QUERY". E.g: "main:user.general".
 */
export function Query(name: string) {
  const [origin, cquery = ''] = name.split(':');
  const [collection, qname] = cquery.split('.');

  return function(target: Object, key: string) {
    if (origin && collection) {
      Object.defineProperty(target, key, {
        get() {
          if (!knownQueries[name]) {
            for (const driver of drivers) {
              const org = driver.origin(origin);
              if (org) {
                const col = org.collection(collection);
                if (col) {
                  knownQueries[name] = col.query(qname);
                }
              }
            }
          }

          return knownQueries[name];
        }
      });
    }
  };
}
