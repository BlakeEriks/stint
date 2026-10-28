/**
 * A Node test reporter (nodejs.org/api/test.html#custom-reporters) writing
 * JUnit with each test's file, which Node's own `junit` reporter leaves out.
 * CI runs the `node --test` suites with it so the hygiene scan can name
 * their slowest tests.
 */

const escapeXml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`,
  );

export default async function* junit(source) {
  yield '<testsuites>\n';
  for await (const { type, data } of source) {
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    if (data.details.type === 'suite' || !data.file) continue;
    yield `<testcase classname="${escapeXml(data.file)}" name="${escapeXml(data.name)}" time="${data.details.duration_ms / 1000}"/>\n`;
  }
  yield '</testsuites>\n';
}
