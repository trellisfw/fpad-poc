function configureWebsocketProvider ({websocket, state}) {
  var config = {
    url: state.get('Login.fpadDomain').replace('https://', '').replace('http://', '')+'/websocket'
  };
  websocket.configure(config);
}
module.exports = configureWebsocketProvider
