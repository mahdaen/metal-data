import { typeOf } from '../../dist/utils/typeof';

test('typeOf string', () => {
  expect(typeOf('')).toEqual('string');
});

test('typeOf number', () => {
  expect(typeOf(0)).toEqual('number');
  expect(typeOf(1)).toEqual('number');
  expect(typeOf(2)).toEqual('number');
  expect(typeOf(NaN)).toEqual('number');
});

test('typeOf boolean', () => {
  expect(typeOf(true)).toEqual('boolean');
});

test('typeOf date', () => {
  expect(typeOf(new Date())).toEqual('date');
});

test('typeOf object', () => {
  expect(typeOf({})).toEqual('object');
});

test('typeOf array', () => {
  expect(typeOf([])).toEqual('array');
});

test('typeOf function', () => {
  const fn = () => {};

  function fx() {}

  expect(typeOf(fn)).toEqual('function');
  expect(typeOf(fx)).toEqual('function');
  expect(typeOf(() => {})).toEqual('function');
  expect(typeOf(class TX {})).toEqual('function');
});
