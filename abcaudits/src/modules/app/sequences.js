import { sequence } from 'cerebral';
import { metadata, oadaDomain, redirect } from '../../config';
import { unset } from 'cerebral/operators'
import {state, props } from 'cerebral/tags'
import * as certifications from '../../common/modules/certifications/sequences';
import * as user_profile from '../../common/modules/user_profile/sequences';
import * as clients from '../../modules/clients/sequences';
import oada from '@oada/cerebral-module/sequences'

export const initialize = sequence('initialize', [
  ({state, props}) => ({
    domain: oadaDomain,
    options: {
      redirect,
      metadata,
      scope: 'trellisfw:all'
    }
  }),
  clients.initialize,
  certifications.initialize,
  user_profile.initialize,
])
