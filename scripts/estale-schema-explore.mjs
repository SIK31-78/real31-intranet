import { readFileSync, writeFileSync } from 'node:fs';
import { buildClientSchema, printSchema, getNamedType } from 'graphql';

const rawJson = readFileSync('docs/estale-schema.json', 'utf-8');
const introspectionResult = JSON.parse(rawJson);

const schema = buildClientSchema(introspectionResult.data);
const sdl = printSchema(schema);
writeFileSync('docs/estale-schema.graphql', sdl, 'utf-8');
console.log('SDL ecrit : docs/estale-schema.graphql (' + (sdl.length / 1024).toFixed(0) + ' Ko)');

const queryType = schema.getQueryType();
const mutationType = schema.getMutationType();
const typeMap = schema.getTypeMap();

const userTypes = Object.values(typeMap)
  .filter((t) => !t.name.startsWith('__'))
  .filter((t) => !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(t.name));

const objectTypes = userTypes.filter((t) => t.constructor.name === 'GraphQLObjectType');
const inputTypes = userTypes.filter((t) => t.constructor.name === 'GraphQLInputObjectType');
const enumTypes = userTypes.filter((t) => t.constructor.name === 'GraphQLEnumType');
const interfaceTypes = userTypes.filter((t) => t.constructor.name === 'GraphQLInterfaceType');
const unionTypes = userTypes.filter((t) => t.constructor.name === 'GraphQLUnionType');
const scalarTypes = userTypes.filter((t) => t.constructor.name === 'GraphQLScalarType');

const queries = queryType ? Object.values(queryType.getFields()) : [];
const mutations = mutationType ? Object.values(mutationType.getFields()) : [];

const lines = [];
lines.push('# Schema eStale - Resume exploratoire');
lines.push('');
lines.push('## Statistiques globales');
lines.push('');
lines.push('- Object types : ' + objectTypes.length);
lines.push('- Input types : ' + inputTypes.length);
lines.push('- Enum types : ' + enumTypes.length);
lines.push('- Interface types : ' + interfaceTypes.length);
lines.push('- Union types : ' + unionTypes.length);
lines.push('- Scalar types : ' + scalarTypes.length);
lines.push('- Queries : ' + queries.length);
lines.push('- Mutations : ' + mutations.length);
lines.push('');

lines.push('## Queries disponibles');
lines.push('');
for (const q of queries.sort((a, b) => a.name.localeCompare(b.name))) {
  const retType = getNamedType(q.type).name;
  const args = q.args.length > 0 ? '(' + q.args.map((a) => a.name).join(', ') + ')' : '';
  lines.push('- `' + q.name + args + '` -> ' + retType);
}
lines.push('');

lines.push('## Mutations disponibles');
lines.push('');
for (const m of mutations.sort((a, b) => a.name.localeCompare(b.name))) {
  const retType = getNamedType(m.type).name;
  const args = m.args.length > 0 ? '(' + m.args.map((a) => a.name).join(', ') + ')' : '';
  lines.push('- `' + m.name + args + '` -> ' + retType);
}
lines.push('');

lines.push('## Types principaux (Object types, tries par nb de champs)');
lines.push('');
const sortedObjects = [...objectTypes].sort((a, b) => {
  return Object.keys(b.getFields()).length - Object.keys(a.getFields()).length;
});
for (const t of sortedObjects.slice(0, 30)) {
  const nbFields = Object.keys(t.getFields()).length;
  lines.push('- `' + t.name + '` (' + nbFields + ' champs)');
}

writeFileSync('docs/estale-schema-summary.md', lines.join('\n'), 'utf-8');
console.log('Resume ecrit : docs/estale-schema-summary.md');
