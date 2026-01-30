const { readFileSync } = require('node:fs');

const deepEqualInAnyOrder = require('deep-equal-in-any-order');
const chai = require('chai');
chai.use(deepEqualInAnyOrder);
const { assert } = chai;

const yaml = require('yaml');

describe('github-actions', () => {
  describe('workflow: close-issues', () => {
    const workflowSrcPath = '.github/workflows/close-issues.yml';

    describe('issueRegex', () => {
      const issueRegex = /(Closes|Fixes|Resolves)\s*:?\s+(?:(?:https:\/\/)?github.com\/getodk\/central\/issues\/|getodk\/central#|#)(\d+)/gi;

      it('should have same form as the regex we test', () => {
        assert.equal(
          yaml.parse(readFileSync(`../${workflowSrcPath}`, 'utf8'))
              .jobs
              .close_issues
              .steps
              .find(step => step.uses.startsWith('actions/github-script@'))
              .with
              .script
              .split('\n')
              .map(line => line.match(/\bconst issueRegex = (.*);$/))
              .find(it => it)[1],
          issueRegex.toString().replace(/\\\\/g, '\\'),
          `If you just updated the issueRegex to pass a new test case, you also need to update its value in ${workflowSrcPath}`,
        );
      });

      [
        [
          `Some feature

          Closes #123`,
          123,
        ],
        [ 'Closes #1, fixes: #2, and Resolves #3', 1, 2, 3 ],
        [ 'Closes getodk/central#1, fixes: #2, and Resolves #3', 1, 2, 3 ],
        [ 'Closes: github.com/getodk/central/issues/4', 4 ],
        [ 'Closes: https://github.com/getodk/central/issues/5', 5 ],
      ].forEach(([ commitText, ...expectedClosedIssues ]) => {
        it(`should close issues: ${expectedClosedIssues} for commitText: ${JSON.stringify(commitText)}`, () => {
          assert.deepEqual(
            [...commitText.matchAll(issueRegex)].map(match => match[2]),
            expectedClosedIssues.map(n => n.toString()),
          );
        });
      });

      // Test that every keyword listed in the github docs is supported.
      // See: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue#linking-a-pull-request-to-an-issue-using-a-keyword
      [
        'close',
        'closes',
        'closed',
        'fix',
        'fixes',
        'fixed',
        'resolve',
        'resolves',
        'resolved',
      ].forEach(keyword => {
        it(`should close issue referenced with keyword '${keyword}'`, () => {
          assert.deepEqual(
            [...`${keyword} #123`.matchAll(issueRegex)].map(match => match[2]),
            [ '123' ],
          );
        });
      });
    });
  });
});
