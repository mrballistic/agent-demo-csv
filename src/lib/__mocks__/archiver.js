// Manual mock for archiver
module.exports = function archiver() {
  return {
    append: (content, opts) => {
      if (opts && opts.name === 'manifest.txt') {
        if (!global.__manifestAppends) global.__manifestAppends = [];
        global.__manifestAppends.push([content, opts.name]);
        // eslint-disable-next-line no-console
        console.log(
          '[ARCHIVER MOCK] __manifestAppends after push:',
          global.__manifestAppends
        );
      }
    },
    file: () => {},
    finalize: () => {
      // eslint-disable-next-line no-console
      console.log('[ARCHIVER MOCK] finalize called');
      // eslint-disable-next-line no-console
      console.log(
        '[ARCHIVER MOCK] __manifestAppends at finalize:',
        global.__manifestAppends
      );
      return Promise.resolve();
    },
    pipe: () => {},
    on: (event, callback) => {
      if (event === 'end') setTimeout(callback, 10);
    },
  };
};
