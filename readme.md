# MetalData

Typescript REST API Client Library

## Driver

**Exambple**

```typescript
import { MetalDriver } from 'src/lib/metal-data/driver';

const driver = new MetalDriver();
```

## Origin

**Example**

```typescript
import { MetalDriver } from 'src/lib/metal-data/driver';
import { MetalOrigin } from 'src/lib/metal-data/origin';

const driver = new MetalDriver();
const origin = new MetalOrigin(driver, { name: 'default', baseURL: 'http://localhost:3000' });
```

**Multiple Origin**

```typescript
import { MetalDriver } from 'src/lib/metal-data/driver';
import { MetalOrigin } from 'src/lib/metal-data/origin';

const driver = new MetalDriver();
const userAPI = new MetalOrigin(driver, { name: 'user-api', baseURL: 'http://localhost:3000' });
const projectAPI = new MetalOrigin(driver, { name: 'project-api', baseURL: 'http://localhost:3001' });
```

## Collection

**Example**

```typescript
import { MetalDriver } from 'src/lib/metal-data/driver';
import { MetalOrigin } from 'src/lib/metal-data/origin';
import { MetalCollection } from 'src/lib/metal-data/collection';
import { MetalData } from 'src/lib/metal-data/record';

interface User extends MetalData {
  first_name: string;
  last_name: string;
  age: number;
}

const driver = new MetalDriver();
const userAPI = new MetalOrigin(driver, { name: 'user-api', baseURL: 'http://localhost:3000' });
const users = new MetalCollection<User>(userAPI, { name: 'user', endpoint: 'users' });

// List all users.
users.find().then(items => {
  items.forEach(item => console.log(item.first_name));
});

// List with filters.
users.find({
  where: {
    age: {
      gt: 10
    }
  },
  orderBy: {
    age: 'desc'
  }
}).then(console.log);

// Get single record.
users.findOne('9892394888').then(item => console.log(item.first_name));
```

## Query

A `.find()` method is a simple one-way method to perform a listing of a Collection and will returns a plain array. While
using `.query()`, it will return a **Query** object, so we can re-use the filters and caching.

**Example**

```typescript
const adults = users.query({
  where: {
    age: {
      gt: 10
    }
  }
});
adults.fetch().then(records => {
  records.forEach(record => console.log(record.data.first_name));
});
```

Query will store the fetched data into the `records` property. Whenever we call the `.query()` method, it will return
the previous query with its filters and data. The `records` will be replaced if call the
`.fetch()` method.

**Example**

```typescript
const adults = users.query();
adults.records.forEach(record => console.log(record.data.first_name));
```

With Query, we can manage all the fetched records at once.

**Manage Users with Find**

```typescript
const allUsers = await users.find();
allUsers.forEach(user => users.update(user.id, { fisrt_name: 'updated' }));
```

**Manage Users with Query**

```typescript
const query = users.query();
await query.fetch();
await query.updateAll({ first_name: 'updated' });
```

If we want to have multiple queries with different filters, we can use a named query.

**Example**

```typescript
const allUsers = users.query();
const adultUsers = users.query('adults', { where: { age: { gt: 10 } } });
```

We can update the filters later.

**Example**

```typescript
const adultUsers = users.query('adults');
adultUsers.where({ age: { gt: 10 }, gender: { eq: 'male' } });
await adultUsers.fetch();
```

## Record

The `.findOne()` method will return a plain object with no helper, so we can't manage the data directly from the
returned object. With Record, we can cache the data and manage the data directly from there.

**Using .findOne()**

```typescript
const me = await users.findOne(882823949);
console.log(me.first_name);
await users.update(me.id, { first_name: 'Updated First Name' });
console.log(me.first_name);
```

**Using Record**

```typescript
const me = users.get('882823949');
await me.fetch();
console.log(me.data.first_name);
await me.update({ first_name: 'Updated First Name' });
console.log(me.data.first_name);
```

Using `Record` also allow us to assign form directly to the record data, so we can save it once the form complete.

**Saving Record**

```typescript
const me = users.get('8928394999');
await me.fetch();

me.data.first_name = 'Name Updated';

await me.save();
```

## Where Filters

The `.find()`, and `.query()` method accepts where filters. There are two types of filters, `AND` condition and `OR`
conditions.

Passing the filter with an Object will mark the filter as `AND` condition, and passing the filter with an Array will
mark the filter as `OR` condition.

**AND filters**

```typescript
users.find({
  where: {
    first_name: 'John',
    last_name: 'Smith'
  }
});
```

The filter above means looking for users with `fisrt_name == "John" AND last_name == "Smith"`.

**OR filters**

```typescript
users.find({
  where: [
    {
      first_name: 'John'
    },
    {
      first_name: 'Michael'
    }
  ]
});
```

The filter above means looking for users with `fisrt_name == "John" OR first_name == "Michael"`.

**OR condition inside AND condition**

```typescript
users.find({
  where: {
    first_name: ['John', 'Michael'],
    age: {
      gt: 10
    }
  }
});
```

The filter above means looking for users with `(first_name == "John" OR first_name == "Michael") AND age > 10`.

**AND condition inside OR condition**

```typescript
users.find({
  where: [
    {
      first_name: 'John',
      age: {
        gt: 10
      }
    },
    {
      first_name: 'Michael',
      age: {
        gt: 15
      }
    }
  ]
});
```

The filters above means looking for users
with `(first_name == "John" AND age > 10) OR (fisrt_name == "Michael" AND age > 15)`.

## Transaction Middleware

By default, Metal Data will use an axios middleware to handle the requests. With a middleware, you can add a function to
transform the request and the response, even a custom handler to run the transaction to forward the requests to 3rd
party services such Algolia.

A middleware is a function that accept `transaction` object and `next` function to continue to the next middlewares.
When adding a middleware, please note that the default axios middleware will be ignored, so you must manually add it if
you want to keep using it. A middleware also must return the `next` call to proceed the next middlewares.

**Example**

```typescript
const origin = new MetalOrigin({ baseURL: 'http://localhost:8000' });

function addJWT(trx, next) {
  if (trx.status !== 'complete') {
    trx.configs.headers['Authorization'] = `Bearer ${token}`;
  }

  return next();
}

function transformResponse(trx, next) {
  const { meta, users } = trx.response.data
  trx.response.data = { meta, data: users };
}

origin
  .use(addJWT)
  .use(origin.http())
  .use(transformResponse);
```

The example above will modify the transaction object and adds an JWT authorization before requesting to the server.
The `transformResponse` middleware will modify the response object so MetalData will understand the data structure.

Another scenario to use middleware is if you want to forward the query requests to algolia but keep the
`POST`, `PUT`, and `DELETE` requests for REST API. To do that you need to add two middleware and both of them must run
the transaction. To prevent duplicate request, on the REST API middleware you must only run the transaction if the
transaction status is not completed.

**Example**

```typescript
function algolia() {
  const client = algoliasearch(config);

  return async (trx, next) => {
    if (trx.request.listing) {
      await trx.run(async () => {
        const { hits } = await client.initIndex('INDEX').search();
        return {
          status: 200,
          statusText: 'Success',
          headers: {},
          data: {
            meta: {},
            data: hits
          }
        };
      });
    }

    return next();
  }
}

function http() {
  const client = axios.create(config);

  return async (trx, next) => {
    if (trx.status !== 'complete') {
      await trx.run(async (configs) => {
        return await client.request(configs);
      });
    }

    return next();
  }
}

origin
  .use(algolia())
  .use(addJWT)
  .use(http())
  .use(transformResponse)
```

## Angular Usage

```typescript
interface User extends MetalData {
  fisrt_name: string;
}

@Injectable({ providedIn: 'root' })
class Driver extends MetalDriver {}

@Injectable({ providedIn: 'root' })
class UserAPI extends MetalOrigin {
  constructor(driver: Driver) {
    super(driver, { name: 'user-api', baseURL: 'http://localhost:3000' });
  }
}

@Injectable({ providedIn: 'root' })
class Users extends MetalCollection<User> {
  constructor(origin: UserAPI) {
    super(origin, { name: 'user', endpoint: 'users' });
  }
}

@Component({
  selector: 'app-test',
  tempalte: '<p *ngFor="let user of query.records">{{user.data.first_name}}</p>'
})
class AppTestComponent {
  public query: MetalQuery<User>;

  constructor(collection: Users) {
    this.query = collection.query();
    this.query.fetch();
  }
}

```
