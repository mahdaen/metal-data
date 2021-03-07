export function strToType(value: any) {
  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    } else if (value === 'false') {
      return false;
    } else if (value === 'null') {
      return null;
    } else if (value === 'undefined') {
      return undefined;
    } else if (Number(value)) {
      return Number(value);
    } else {
      return value;
    }
  } else {
    return value;
  }
}
