'use strict';

const fs = require('fs');
const protagonist = require('protagonist');

class ServerlessApibValidator {
  constructor(serverless, options) {
    this.serverless = serverless;

    this.commands = {
      validate: {
        usage: 'Validate that an API Blueprint has full coverage over a Serverless config',
        lifecycleEvents: ['start']
      }
    };

    this.hooks = {
      'before:package:initialize': this.validate.bind(this),
      'validate:start': this.validate.bind(this, true)
    };
  }

  getOptions() {
    return Object.assign({
      blueprintFile: './apiary.apib',
      basePath: ''
    }, this.serverless.service.custom && this.serverless.service.custom.apibValidator || {});
  }

  /**
   * Validate the API blueprint file against a serverless.yml
   */
  validate(isCommand = false) {
    const options = this.getOptions();
    
    if(isCommand) {
      console.log('Validating API blueprint...');
    }

    if(typeof this.serverless.service.functions == 'undefined') {
      if(isCommand) {
        console.log('⚠️  No functions defined.');
      }

      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Load the API blueprint file
      let apib;
      try {
        apib = fs.readFileSync(options.blueprintFile, 'utf-8');
      } catch(e) {
        reject(`🚫  API Blueprint file was not found at ${options.blueprintFile}.`);
        return;
      }

      // Get a list of every function defined in serverless.yml
      const lambdaEndpoints = [];
      const functions = this.serverless.service.functions;
      Object.keys(this.serverless.service.functions)
        .forEach(name => {
          if(!functions[name].events) {
            return;
          }

          functions[name].events
            .filter(e => !!e.http)
            .forEach(event =>
              lambdaEndpoints.push(Object.assign({}, event.http, { name }))
            );
        });

      // Parse the API blueprint
      protagonist.parse(apib, (err, blueprint) => {
        if(err) {
          reject(err);
          return;
        }

        let annotation = null;
        this.traverseContent(blueprint.content, 'annotation', a => {
          annotation = a;
        });
        if(annotation) {
          reject('🚫  API Blueprint is not valid.\n\t' + annotation.content);
          return;
        }

        const endpointsDocumented = [];

        // Find every resource
        this.traverseContent(blueprint.content, 'resource', resource => {
          if(resource.attributes.href.element == 'string') {
            const resourcePath = resource.attributes.href.content;

            // Find every action
            this.traverseContent(resource.content, 'transition', transition => {
              const transitionPath = transition.attributes && transition.attributes.href
                ? transition.attributes.href.content
                : null;

              const methodsFound = [];
              this.traverseContent(transition.content, 'httpRequest', request => {
                const method = request.attributes.method;
                if(methodsFound.indexOf(request) == -1) {
                  methodsFound.push(method);
                  endpointsDocumented.push({
                    path: transitionPath || resourcePath,
                    method: method
                  });
                }
              });
            });
          }
        });

        const notDocumented = [];

        lambdaEndpoints.forEach(endpoint => {
          const matchPath = this.cleanPath(options.basePath + endpoint.path);
          const matchMethod = endpoint.method.toLowerCase();

          const isDocumented = endpointsDocumented.find(doc => {
            const docPath = this.cleanPath(doc.path);
            const docMethod = doc.method.content.toLowerCase();

            return docPath === matchPath && docMethod === matchMethod;
          });
          if(!isDocumented) {
            notDocumented.push(endpoint.name);
          }
        });

        if(notDocumented.length > 0) {
          // Stop the serverless deployment
          reject(`🚫  API Blueprint does not contain documentation for the following functions:\n\n\t${notDocumented.join(', ')}`);
          return;
        }

        // The API Blueprint is valid
        resolve();
        if(isCommand) {
          console.log('✅  API Blueprint is valid');
        }
      });
    });
  }

  /**
   * Loop through a section of AST content and run
   * a callback every time an element is found.
   * 
   * @param {Object} content
   * @param {string} element
   * @param {function} callback
   */
  traverseContent(content, element, callback) {
    if(!content || !Array.isArray(content)) {
      return;
    }

    content.forEach(item => {
      if(item.element === element) {
        callback(item);
      } else {
        this.traverseContent(item.content, element, callback);
      }
    });
  }

  /**
   * Remove optional paramters and trailing slash
   * 
   * @param {string} path
   */
  cleanPath(path) {
    return path.replace(/{\?[^=]+}/g, '').replace(/\/$/, '');
  }
}

module.exports = ServerlessApibValidator;
