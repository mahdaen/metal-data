export function columnGroup<T>(target: T[], maxRows: number): Array<T[]> {
  if (target.length <= maxRows) {
    return [target];
  }

  const group: Array<T[]> = [];
  const limit = Math.ceil(target.length / maxRows);

  for (let col = 0; col < limit; ++col) {
    const column = [];

    for (let i = (col * maxRows); i < (col * maxRows + maxRows); ++i) {
      if (typeof target[i] !== 'undefined') {
        column.push(target[i]);
      }
    }

    if (column.length) {
      group.push(column);
    }
  }

  return group;
}
