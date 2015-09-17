var _ = require('underscore')
var fs = require('fs')
var chalk = require('chalk')
var is = require('./utils/is')
var load = require('./utils/load')
var watch = require('./watch')
var pause = require('connect-pause')
var jsonServer = require('../server')

function prettyPrint (argv, object, rules, responses) {
  var host = argv.host === '0.0.0.0' ? 'localhost' : argv.host
  var port = argv.port
  var root = 'http://' + host + ':' + port

  console.log()
  console.log(chalk.bold('  Resources'))
  for (var prop in object) {
    console.log('  ' + root + '/' + prop)
  }

  if (rules) {
    console.log()
    console.log(chalk.bold('  Other routes'))
    for (var rule in rules) {
      console.log('  ' + rule + ' -> ' + rules[rule])
    }
  }

  if (responses) {
    console.log()
    console.log(chalk.bold('  Other response'))
    for (var response in responses) {
      console.log('  ' + response + ' -> ' + responses[response])
    }
  }

  console.log()
  console.log(chalk.bold('  Home'))
  console.log('  ' + root)
  console.log()
}

function createApp (source, object, routes, responses, argv) {
  var app = jsonServer.create()

  var router = jsonServer.router(
    is.JSON(source) ?
    source :
    object
  )

  app.use(jsonServer.defaults)

  if (routes) {
    var rewriter = jsonServer.rewriter(routes)
    app.use(rewriter)
  }

  if (argv.delay) {
    app.use(pause(argv.delay))
  }

  if (responses) {
    var key_placeholder = ""
    var others = []
    Object.keys(responses).forEach(function(key) {
      if (responses[key] == "*") {
        key_placeholder = key
      }
      else {
        others.push(key)
      }
    });
    router.render = function (req, res) {
      new_response = _.clone(responses)
      new_response[key_placeholder] = res.locals.data
      res.jsonp(
        new_response
      )
    }
  }

  router.db._.id = argv.id
  app.db = router.db
  app.use(router)
  return app
}

module.exports = function (argv) {

  var source = argv._[0]
  var app
  var server

  console.log()
  console.log(chalk.cyan('  \\{^_^}/ hi!'))

  function start (cb) {
    console.log()
    console.log(chalk.gray('  Loading', source))

    // Load JSON, JS or HTTP database
    load(source, function (err, data) {

      if (err) throw err

      // Load additional routes
      if (argv.routes) {
        console.log(chalk.gray('  Loading', argv.routes))
        var routes = JSON.parse(fs.readFileSync(argv.routes))
      }

      console.log(chalk.gray('  Done'))

      // Load additional response
      if (argv.response) {
        console.log(chalk.gray('  Loading', argv.response))
        var responses = JSON.parse(fs.readFileSync(argv.response))
      }

      console.log(chalk.gray('  Done'))

      // Create app and server
      app = createApp(source, data, routes, responses, argv)
      server = app.listen(argv.port, argv.host)

      // Display server informations
      prettyPrint(argv, data, routes, responses)

      cb && cb()
    })
  }

  // Start server
  start(function () {

    // Snapshot
    console.log(
      chalk.gray('  Type s + enter at any time to create a snapshot of the database')
    )

    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', function (chunk) {
      if (chunk.trim().toLowerCase() === 's') {
        var file = 'db-' + Date.now() + '.json'
        app.db.saveSync(file)
        console.log('  Saved snapshot to ' + file + '\n')
      }
    })

    // Watch files
    if (argv.watch) {
      console.log(chalk.gray('  Watching...'))
      console.log()
      watch(argv, function (file) {
        console.log(chalk.gray('  ' + file + ' has changed, reloading...'))
        server && server.close()
        start()
      })
    }

  })

}
