'use strict';

const fs = require('fs');
const protagonist = require('protagonist');

class ServerlessApibValidator {
  constructor(serverless, options) {
    this.serverless = serverless;

    this.commands = {
      generate: this.generate.bind(this),
      validate: this.runValidate.bind(this)
    };
    this.hooks = {
      'before:package:initialize': this.validate.bind(this)
    };
  }

  getOptions() {
    return Object.assign({
      blueprintFile: './apiary.apib',
      basePath: ''
    }, this.serverless.service.custom && this.serverless.service.custom.apibValidator || {});
  }

  generate() {
    
  }

  runValidate() {
    this.readBlueprint()
      .then(() => {
        console.log(chalk.green('✔︎') + ' API Blueprint is valid.');
        console.log(chalk.yellow('We can only check if it is documented when packaging/deploying.'));
      });
  }

  readBlueprint() {
    const options = this.getOptions();

    let apib;
    try {
      apib = fs.readFileSync(options.blueprintFile, 'utf-8');
    } catch(e) {
      reject(`API Blueprint file was not found at ${options.blueprintFile}.`);
    }

    return apib;
  }

  validate() {
    const options = this.getOptions();

    if(typeof this.serverless.service.functions == 'undefined') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let apib;
      try {
        apib = fs.readFileSync(options.blueprintFile, 'utf-8');
      } catch(e) {
        reject(`API Blueprint file was not found at ${options.blueprintFile}.`);
        return;
      }

      const lambdaEndpoints = [];
      const functions = this.serverless.service.functions;
      Object.keys(this.serverless.service.functions)
        .forEach(name => {
          if(!functions[name].events) {
            return;
          }

          functions[name].events
            .filter(e => !!e.http)
            .forEach(event => lambdaEndpoints.push({ ...event.http, name }));
        });
      console.log(lambdaEndpoints);

      protagonist.parse(apib, (err, blueprint) => {
        if(err) {
          reject(err);
          return;
        }

        const endpointsDocumented = [];

        const traverseContent = (content, element, callback) => {
          if(!content || !Array.isArray(content)) {
            return;
          }

          content.forEach(item => {
            if(item.element === element) {
              callback(item);
            } else {
              traverseContent(item.content, element, callback);
            }
          });
        };

        traverseContent(blueprint.content, 'resource', resource => {
          if(resource.attributes.href.element == 'string') {
            const resourcePath = resource.attributes.href.content;

            traverseContent(resource.content, 'httpRequest', request => {
              endpointsDocumented.push({
                path: resourcePath,
                method: request.attributes.method
              });
            });
          }
        });

        const notDocumented = [];

        lambdaEndpoints.forEach(endpoint => {
          const matchPath = options.basePath + endpoint.path;

          const isDocumented = endpointsDocumented.find(doc => {
            // Remove optional paramters
            const documentedPath = doc.path.replace(/{\?\w+}/g, '');
            console.log(matchPath, documentedPath);
            return documentedPath === matchPath;
          });
          if(!isDocumented) {
            notDocumented.push(endpoint.name);
          }
        });

        if(notDocumented.length > 0) {
          reject(`API Blueprint does not contain documentation for the following functions:\n\n\t${notDocumented.join(', ')}`);
        }

        reject('API Blueprint is validated. I\'m just here to cancel deployment.');
      });
    });
  }
}

module.exports = ServerlessApibValidator;
