import { buildDGraphResolvers } from '../../buildDGraphResolvers'
import {
  buildSchema,
  graphql,
  defaultFieldResolver,
  GraphQLField,
} from 'graphql'
import {
  makeExecutableSchema,
  mergeSchemas,
  buildSchemaFromTypeDefinitions,
  SchemaDirectiveVisitor,
} from 'graphql-tools'
import { GraphQLModule } from '@graphql-modules/core'
import './gql.module'

describe('buildDGraphResolvers', () => {
  it('base', async () => {
    let schema = buildSchema(`
    type Query {
      hello:String!
    }
    `)
    const resolvers = buildDGraphResolvers(schema, () => {
      return {
        data: {
          hello: '7',
        },
      }
    })
    let schema2 = mergeSchemas({
      schemas: [schema],
      resolvers: resolvers,
    })

    {
      const query = `
      query {
        hello
      }
      `
      let result = await graphql(schema2, query, {}, {}, { a: 7 })
    }

    {
      const otherModule = makeExecutableSchema({
        typeDefs: [
          `
          type Query {
            world:String
          }
          `,
        ],
        resolvers: {
          Query: {
            world: () => 'world',
          },
        },
      })
      const schema3 = mergeSchemas({
        schemas: [schema2, otherModule],
      })
      const query = `
      query {
        hello
        world
      }
      `
      let result = await graphql(schema3, query, {}, {}, { a: 7 })
    }
  })
  it('two query', async () => {
    let schema = buildSchema(`
    type Query {
      hello:String!
      hello2: String!
    }
    `)
    let c = 0
    const resolvers = buildDGraphResolvers(schema, () => {
      c++
      return {
        data: {
          hello: '7',
          hello2: '7',
        },
      }
    })
    let schema2 = mergeSchemas({
      schemas: [schema],
      resolvers: resolvers,
    })

    const query = `
    query {
      hello
      hello2
    }
    `
    let result = await graphql(schema2, query, {}, {}, { a: 7 })
    expect(c).toEqual(1)
  })
  it('with directive', async () => {
    let schema = buildSchema(`
    directive @auth(r: String) on FIELD_DEFINITION
    type Query {
      hello:String! @auth
    }
    `)
    class AuthDirective extends SchemaDirectiveVisitor {
      public visitFieldDefinition(field: GraphQLField<any, any>) {
        const { resolve = defaultFieldResolver } = field
        field.resolve = async (...r) => {
          let val = await resolve(...r)
          val = val + '1'
          return val
        }
        return field
      }
    }
    const resolvers = buildDGraphResolvers(schema, () => {
      return {
        data: {
          hello: '7',
        },
      }
    })
    let schema2 = mergeSchemas({
      schemas: [schema],
      resolvers: resolvers,
      schemaDirectives: {
        auth: AuthDirective,
      },
    })

    {
      const query = `
      query {
        hello
      }
      `
      let result = await graphql(schema2, query, {}, {}, { a: 7 })
      expect(result.data.hello).toEqual('71')
    }
  })
  it('with variables', async () => {
    let schema = buildSchema(`
    type Query {
      hello(word: String!):String!
    }
    `)
    const word = 'world!'
    const resolvers = buildDGraphResolvers(schema, ({ variables }) => {
      return {
        data: {
          hello: variables['word'],
        },
      }
    })
    let schema2 = mergeSchemas({
      schemas: [schema],
      resolvers: resolvers,
    })
    const query = `
    query($word:String!) {
      hello(word:$word)
    }
    `
    let result = await graphql(schema2, query, {}, {}, { word: word })
    expect(result.errors || []).toEqual([])
    expect(result.data.hello).toEqual(word)
  })
  it('with alias', async () => {
    let schema = buildSchema(`
    type Query {
      hello(word: String!):String!
    }
    `)
    const word = 'world!'
    let data: any
    const resolvers = buildDGraphResolvers(schema, ({ variables }) => {
      return { data: data(variables) }
    })
    let schema2 = mergeSchemas({
      schemas: [schema],
      resolvers: resolvers,
    })

    {
      const query = `
      query($word:String!) {
        a: hello(word:$word)
      }
      `
      data = (variables: any) => ({ a: variables['word'] })
      let result = await graphql(schema2, query, {}, {}, { word: word })
      expect(result.errors || []).toEqual([])
      expect(result.data.a).toEqual(word)
    }

    {
      const query = `
      query($word:String!) {
        a: hello(word:$word)
        b: hello(word:$word)
      }
      `
      data = (variables: any) => ({
        a: variables['word'],
        b: variables['word'],
      })
      let result = await graphql(schema2, query, {}, {}, { word: word })
      expect(result.errors || []).toEqual([])
      expect(result.data).toEqual({ a: word, b: word })
    }
  })
  it('graphql module with directive', async () => {
    const a = buildSchemaFromTypeDefinitions(`
    type User {
      id: String!
    }
    type Query {
      u: User!
    }
    `)
    const b = buildSchemaFromTypeDefinitions(`
    directive @auth(r: String) on FIELD_DEFINITION
    type User {
      id: String! @auth(r:"sss")
    }
    `)
    class AuthDirective extends SchemaDirectiveVisitor {
      public visitFieldDefinition(field: GraphQLField<any, any>) {
        const { resolve = defaultFieldResolver } = field
        field.resolve = async (...r) => {
          let val = await resolve(...r)
          val = val + '1'
          return val
        }
        return field
      }
    }
    const s = mergeSchemas({
      schemas: [a, b],
      mergeDirectives: true,
    })
    const m1 = new GraphQLModule({
      typeDefs: [s],
      resolvers: () => {
        const r = buildDGraphResolvers(s, () => {
          return {
            data: {
              u: { id: '7' },
            },
          }
        })
        return r
      },
      schemaDirectives: {
        auth: AuthDirective,
      },
    })
    const m2 = new GraphQLModule({
      typeDefs: `
      type Query {
        hello: String!
      }
      `,
      resolvers: {
        Query: {
          hello: () => 'hello',
        },
      },
    })
    const m = new GraphQLModule({
      imports: [m1, m2],
    })
    SchemaDirectiveVisitor.visitSchemaDirectives(m.schema, m.schemaDirectives)
    const q = `
    query {
      u {
        id
      }
    }
    `
    const r = await graphql(m.schema, q, {}, {})
    expect(r.errors || []).toEqual([])
    expect(r.data.u.id).toEqual('71')
  })
  it('graphql module with directive and graphql-tag loader', async () => {
    const a = buildSchemaFromTypeDefinitions((await import('./a.gql')) as any)
    const b = buildSchemaFromTypeDefinitions((await import('./b.gql')) as any)
    class AuthDirective extends SchemaDirectiveVisitor {
      public visitFieldDefinition(field: GraphQLField<any, any>) {
        const { resolve = defaultFieldResolver } = field
        field.resolve = async (...r) => {
          let val = await resolve(...r)
          val = val + '1'
          return val
        }
        return field
      }
    }
    const s = mergeSchemas({
      schemas: [a, b],
      mergeDirectives: true,
    })
    const m = new GraphQLModule({
      typeDefs: [s],
      resolvers: () => {
        const r = buildDGraphResolvers(s, () => {
          return {
            data: {
              u: { id: '7' },
            },
          }
        })
        return r
      },
      schemaDirectives: {
        auth: AuthDirective,
      },
    })
    SchemaDirectiveVisitor.visitSchemaDirectives(m.schema, m.schemaDirectives)
    const q = `
    query {
      u {
        id
      }
    }
    `
    const r = await graphql(m.schema, q, {}, {})
    expect(r.errors || []).toEqual([])
    expect(r.data.u.id).toEqual('71')
  })
})
