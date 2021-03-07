# Metal Data
Typescript REST API Client Library

[API Docs](https://mahdaen.github.io/metal-data).

## Driver

**Exambple**
```typescript
import { MetalDriver } from 'metal-data';

const driver = new MetalDriver();
```

## Origin

**Example**
```typescript
import { MetalDriver } from 'metal-data';
import { MetalOrigin } from 'metal-data';

const driver = new MetalDriver();
const origin = new MetalOrigin(driver, { name: 'default', baseURL: 'http://localhost:3000' });
```

**Multiple Origin**
```typescript
import { MetalDriver } from 'metal-data';
import { MetalOrigin } from 'metal-data';

const driver = new MetalDriver();
const userAPI = new MetalOrigin(driver, { name: 'user-api', baseURL: 'http://localhost:3000' });
const projectAPI = new MetalOrigin(driver, { name: 'project-api', baseURL: 'http://localhost:3001' });
```

## Collection

**Example**
```typescript
import { MetalDriver } from 'metal-data';
import { MetalOrigin } from 'metal-data';
import { MetalCollection } from 'metal-data'; 
import { MetalData } from 'metal-data'; 

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
A `.find()` method is a simple one-way method to perform a listing of a Collection and will returns a plain array.
While using `.query()`, it will returns a **Query** object so we can re-use the filters and caching. 

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

Query will store the fetched data into the `records` property. Whenever we call the `.query()` method,
it will return the previous query with it's filters and data. The `records` will be replaced if call the
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
allUsers.forEach(user => users.update(user.id, { fisrt_name:'updated' }));
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
adultUsers.where({ age: { gt: 10 }, gender: { eq: 'male' }});
await adultUsers.fetch();
```

## Record
The `.findOne()` method will returns a plain object with no helper, so we can't manage the data directly from
the returned object. With Record, we can cahce the data and manage the data directly from there.

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

Using `Record` also allow us to assign form directly to the
record data, so we can save it once the form complete.

**Saving Record**
```typescript
const me = users.get('8928394999');
await me.fetch();

me.data.first_name = 'Name Updated';

await me.save();
```

## Where Filters
The `.find()`, and `.query()` method accepts where filters.
There are two types of filters, `AND` condition and `OR` conditions. 

Passing the filter with an Object will mark the filter as `AND` condition, and passing
the filter with an Array will mark the filter as `OR` condition.

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

The filters above means looking for users with `(first_name == "John" AND age > 10) OR (fisrt_name == "Michael" AND age > 15)`.

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
    super(driver, { name:'user-api', baseURL: 'http://localhost:3000' });
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
