import randCert from 'fpad-rand-cert'
import { unset, set, when } from 'cerebral/operators'
import {state, props } from 'cerebral/tags'
import templateAudit from './GlobalGAP_FullAudit.js'
import _ from 'lodash'
import Promise from 'bluebird';
import signatures from 'fpad-signatures'
import prvKey from '../../prvKey.js'
import pubKey from '../../pubKey.js'
var agent = require('superagent-promise')(require('superagent'), Promise);

export let closeViewer = [
  unset(state`App.model.certifications.${props`name`}.cert_viewer`)
]

export let showViewer = [
  showDoc,
  //set(state`App.model.certifications.${props`name`}`, {cert_viewer: {doc: props`doc_type`, expanded: ''}})
]

function showDoc({state, props, path}) {
  state.set(`App.model.certifications.${props.name}.cert_viewer`, {
    doc: props.doc, 
    expanded: ''
  })
}

export let toggleCertSelect = [
  set(state`App.model.certifications.${props`name`}.selected`, props`checked`)
]

export let initialize = [

]

export let signAudit = [
  generateAuditSignature, {
    success: [
      set(state`App.model.certifications.${props`name`}.audit.signatures`, props`signatures`),
    ],
    error: [],
  },
]

export let addCertification = [
  addRandomCert, {
    success: [
      set(state`App.model.certifications.${props`certid`}.audit`, props`audit`),
      set(state`App.view.certifications.${props`certid`}`, {selected: false}),
      when (state`ClientPanel.clients.${props`clientId`}.org_name`), {
        true: [],
        false: [set(state`ClientPanel.clients.${props`clientId`}.org_name`, props`audit.organization.name`)]
      },
    ],
    error: [],
  },
] 

export let deleteCertifications = [
  deleteSelectedCertifications, {
    success: [
      unsetCerts,
    ],
    error: [],
  }
]

export let updateCertifications = [
  updateCerts, {
    success: [
      setCertifications,
    ],
    error: [],
  }
]

function setCertifications({state, props, path}) {
  let clientId = state.get('ClientPanel.selected_client')
  Object.keys(props.newAudits).forEach(key => {
    state.set(`ClientPanel.clients.${clientId}.certifications.${key}`, {audit: props.newAudits[key]});
    state.set(`App.view.certifications.${key}`, {selected: false});
  })
}

function generateAuditSignature({state, props, path}) {
  let domain = state.get('App.oada_domain')
  var kid = 'ABCAudits'
  var alg = 'RS256'
  var kty = 'RSA'
  var typ = 'JWT'
  var jku = 'https://raw.githubusercontent.com/trellisfw/trusted-list/master/jku-test/jku-test.json' 
  var headers = { kid, alg, kty, typ, jwk:pubKey, jku }
  let clientId = state.get('ClientPanel.selected_client')
  let audit = _.clone(props.audit)
  return signatures.generate(audit, prvKey, headers).then((signatures) => {
    return agent('PUT', domain+'/bookmarks/trellisfw/clients/'+clientId+'/certifications/'+props.name+'/audit/signatures')
    .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
    .set('Content-Type', 'application/vnd.trellisfw.certification.globalgap.1+json')
    .send(signatures)
    .end()
    .then((res) => {
      return path.success({signatures})
    })
  })
}

function deleteSelectedCertifications({state, props, path}) {
  let domain = state.get('App.oada_domain')
  let id = state.get('ClientPanel.selected_client')
  let selectedCerts = []
  let certs = state.get(`App.model.certifications`)
  Object.keys(certs).forEach((key) => {
    if (certs[key].selected) selectedCerts.push(key)
  })
  return Promise.map(selectedCerts, (key) => {
    return agent('DELETE', domain+'/bookmarks/trellisfw/clients/'+id+'/certifications/'+key)
    .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
    .end()
  }).then(() => {
    return path.success({deletedCerts:selectedCerts})
  })
}

function unsetCerts({state, props}) {
  let clientId = state.get('ClientPanel.selected_client')
  props.deletedCerts.forEach(key => {
    state.unset(`ClientPanel.clients.${clientId}.certifications.${key}`)
    state.unset(`App.model.certifications.${key}`)
  })
}

function updateCerts({state, props, path}) {
  let domain = state.get('App.oada_domain')
  let a = state.get('App.model.certifications')
  let clientId = state.get(`ClientPanel.selected_client`)
  let clientName = state.get(`ClientPanel.clients.${clientId}.name`)
  let certifications = state.get(`ClientPanel.clients.${clientId}.certifications`);
  let newAudits = {};
  return Promise.map(Object.keys(certifications), (key) => {
    if (!a[key].selected) return
    let audit = randCert.generateAudit({
      template: templateAudit, 
      minimizeAuditData: true,
      organization: {name: clientName},
      year: (parseInt(certifications[key].audit.conditions_during_audit.operation_observed_date.slice(0,4), 10)+1).toString(),
      scope: {
        products_observed: certifications[key].audit.scope.products_observed,
        operations: certifications[key].audit.scope.operations
      }
    })
    return agent('POST', domain+'/resources')
    .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
    .set('Content-Type', 'application/vnd.trellisfw.audit.globalgap.1+json')
    .send(audit)
    .end()
    .then((response) => {
      let id = response.headers.location.split('/')
      id = id[id.length-1]
      audit._id = 'resources/'+id
      return agent('POST', domain+'/resources')
      .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
      .set('Content-Type', 'application/vnd.trellisfw.certification.globalgap.1+json')
      .send({audit: { _id: id, _rev: '0-0'}})
      .end()
      .then((res) => {
        let certid = response.headers.location.split('/')
        certid = certid[certid.length-1]
        newAudits[certid] = audit
        return agent('PUT', domain+'/bookmarks/trellisfw/clients/'+clientId+'/certifications/'+certid)
        .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
        .set('Content-Type', 'application/vnd.trellisfw.certification.globalgap.1+json')
        .send({_id:'resources/'+certid, _rev: '0-0'})
        .end()
      })
    })
  }).then(() => {
    return path.success({newAudits, clientId})
  })
}

function addRandomCert({state, props, path}) {
  let domain = state.get('App.oada_domain')
  let clientId = state.get(`ClientPanel.selected_client`)
  let clientName = state.get(`ClientPanel.clients.${clientId}.name`)
  let orgName = state.get(`ClientPanel.clients.${clientId}.org_name`)
  let audit = randCert.generateAudit({
    template: templateAudit, 
    minimizeAuditData: true,
    organization: {contacts: [{ name: clientName}]},
    certifying_body: { name: 'AbcAudits' }
  })
  if (orgName) audit.organization.name = orgName;
  let auditid;
  let certid;
  return agent('POST', domain+'/resources')
  .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
  .set('Content-Type', 'application/vnd.trellisfw.audit.globalgap.1+json')
  .send(audit)
  .end()
  .then((response) => {
    auditid = response.headers.location.split('/')
    auditid = auditid[auditid.length-1]
    audit._id = 'resources/'+auditid
    return agent('POST', domain+'/resources')
    .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
    .set('Content-Type', 'application/vnd.trellisfw.certification.globalgap.1+json')
    .send({audit: {_id:'resources/'+auditid, _rev: '0-0'}})
    .end()
    .then((response) => {
      certid = response.headers.location.split('/')
      certid = certid[certid.length-1]
      return agent('PUT', domain+'/bookmarks/trellisfw/clients/'+clientId+'/certifications/'+certid)
      .set('Authorization', 'Bearer '+ state.get('UserProfile.user.token'))
      .set('Content-Type', 'application/vnd.trellisfw.certification.globalgap.1+json')
      .send({_id:'resources/'+certid, _rev: '0-0'})
      .end()
    }).then(() => {
      return path.success({certid, audit, clientId})
    })
  })
}
