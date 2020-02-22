import { GraphQLSchema, GraphQLFieldResolver } from 'graphql'
import { FilterToSchema, Request } from 'graphql-tools'

export interface Fetcher<C = any, R = { data: any }> {
  (req: Request & { context: C }): R | Promise<R>
}
export const DGraphRmoteContextKey = Symbol('dgraph')

export interface Context {
  [DGraphRmoteContextKey]: DGraphRmote
}

type Resolvers = { [k: string]: GraphQLFieldResolver<any, any> }

export class DGraphRmote {
  constructor(public fetcher: Fetcher, public filterToSchema: FilterToSchema) {}
  request: Promise<{ data: any }>
  resolve: GraphQLFieldResolver<any, Context> = async (
    root,
    args,
    ctx,
    info,
  ) => {
    if (!this.request) {
      this.request = (async () => {
        const { operation } = info
        let req: Request = {
          document: { kind: 'Document', definitions: [operation] },
          variables: info.variableValues,
        }
        req = this.filterToSchema.transformRequest(req)
        let resp = await this.fetcher({
          ...req,
          context: ctx,
        })
        return resp
      })()
    }
    return this.request.then(resp => {
      let val = resp.data[info.path.key]
      return val
    })
  }
  static makeResolver = (
    fetcher: Fetcher,
    filterToSchema: FilterToSchema,
  ): GraphQLFieldResolver<any, Context> => (...r) => {
    const ctx = r[2]
    ctx[DGraphRmoteContextKey] =
      ctx[DGraphRmoteContextKey] || new DGraphRmote(fetcher, filterToSchema)
    const dgraph = ctx[DGraphRmoteContextKey]
    return dgraph.resolve(...r)
  }
}

export const buildDGraphResolvers = <C = any>(
  schema: GraphQLSchema,
  fetcher: Fetcher<C>,
) => {
  let resolvers = {}
  const resolver = DGraphRmote.makeResolver(fetcher, new FilterToSchema(schema))

  const queryType = schema.getQueryType()
  const queries = queryType.getFields()
  const queryResolvers = Object.keys(queries).reduce((resolvers, key) => {
    resolvers[key] = resolver
    return resolvers
  }, {} as Resolvers)
  resolvers[queryType.name] = queryResolvers

  const mutationType = schema.getMutationType()
  if (mutationType) {
    const mutations = mutationType.getFields()
    const mutationResolvers = Object.keys(mutations).reduce(
      (resolvers, key) => {
        resolvers[key] = resolver
        return resolvers
      },
      {} as Resolvers,
    )
    resolvers[mutationType.name] = mutationResolvers
  }

  return resolvers
}

export default buildDGraphResolvers
