import { diff, compare } from '../../dist/utils/diff';

const a = {
  a: 1,
  b: {
    a: 1,
    b: 2,
    c: {
      a: 1,
      b: 2,
      c: 3
    }
  },
  d: [1, 2, 3, { a: 1, b: 2 }]
};
const b = {
  a: 1,
  b: {
    a: 1,
    b: 1,
    c: {
      a: 1,
      b: 2,
      d: 3
    }
  },
  c: {
    a: 2,
    b: 2
  },
  d: [1, 1, 3, { a: 1, b: 1 }, 4]
};

test('Diff simple object', () => {
  expect(diff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
});

test('Diff complex object', () => {
  expect(diff(a, b)).toEqual({
    b: {
      b: 1,
      c: {
        c: undefined,
        d: 3
      }
    },
    d: [1, 1, 3, { a: 1, b: 1 }, 4],
    c: {
      a: 2,
      b: 2
    }
  });
});

test('Diff deep complex object and array.', () => {
  expect(diff(a, b, true)).toEqual({
    b: {
      b: 1,
      c: {
        c: undefined,
        d: 3
      }
    },
    d: [NaN, 1, NaN, { b: 1 }, 4],
    c: {
      a: 2,
      b: 2
    }
  });
});

test('Diff string.', () => {
  expect(diff('ABC', 'ACC')).toEqual([NaN, 'C', NaN]);
  expect(diff('ABCD', 'ABDD')).toEqual([NaN, NaN, 'D', NaN]);
  expect(diff('ABC', 'ABCD')).toEqual([NaN, NaN, NaN, 'D']);
  expect(diff('ABCD', 'ABD')).toEqual([NaN, NaN, 'D', null]);
});

test('Diff complex string.', () => {
  expect(diff('Lorem ipsum dolor', 'Lorem dosor dolor.'))
    .toEqual([
      NaN, NaN, NaN, NaN, NaN, NaN,
      'd', 'o', NaN, 'o', 'r',
      NaN, NaN, NaN, NaN, NaN, NaN, '.'
    ]);
});
