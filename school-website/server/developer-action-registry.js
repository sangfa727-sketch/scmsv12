'use strict';

/**
 * DCC action registry proposal, intentionally inert.
 *
 * This module is a server-side policy-definition contract only. It is not an
 * authentication verifier, endpoint, persistent permission store, or complete
 * authorization boundary. The current SCMS frontend is static; do not expose
 * this module to browser code or infer that a private admin surface exists.
 *
 * Every action remains disabled until a trusted server adapter, operator
 * directory, target resolver, audit/idempotency persistence, sandbox runtime
 * tests, and an explicit release review are implemented.
 */

const DEFINITIONS = [
  ['overview.read', 'platform', 'R0', false, false, false, false, 'aggregate_health_usage'],
  ['system.health.read', 'service', 'R0', false, false, false, false, 'sanitized_service_diagnostics'],
  ['system.incident.read', 'incident', 'R0', true, false, false, false, 'redacted_incident_metadata'],
  ['clients.list', 'client_collection', 'R0', false, false, false, false, 'minimal_client_metadata'],
  ['clients.read', 'client', 'R0', true, false, false, false, 'client_operational_metadata'],
  ['clients.create', 'client_new', 'R2', true, true, true, true, 'minimal_onboarding_fields'],
  ['clients.update', 'client', 'R1', true, false, false, true, 'non_sensitive_client_metadata'],
  ['clients.suspend', 'client', 'R2', true, true, true, true, 'client_suspension_reason_and_impact'],
  ['clients.reactivate', 'client', 'R2', true, true, true, true, 'client_reactivation_reason_and_impact'],
  ['clients.archive', 'client', 'R3', true, true, true, true, 'retention_and_recovery_metadata'],
  ['subscriptions.list', 'subscription_collection', 'R0', false, false, false, false, 'subscription_status_metadata'],
  ['subscriptions.read', 'subscription', 'R0', true, false, false, false, 'subscription_status_and_provider_refs'],
  ['subscriptions.change_plan', 'subscription', 'R2', true, true, true, true, 'subscription_plan_delta'],
  ['subscriptions.adjust_entitlement', 'subscription', 'R2', true, true, true, true, 'entitlement_delta'],
  ['billing.invoice_status.read', 'invoice', 'R0', true, false, false, false, 'invoice_status_and_provider_ref'],
  ['billing.refund.request', 'payment', 'R3', true, true, true, true, 'refund_amount_currency_and_reason'],
  ['crm.leads.list', 'lead_collection', 'R0', false, false, false, false, 'consent_filtered_lead_fields'],
  ['crm.leads.read', 'lead', 'R0', true, false, false, false, 'purpose_limited_contact_fields'],
  ['crm.leads.update', 'lead', 'R1', true, false, false, true, 'lead_status_and_consent_preferences'],
  ['crm.leads.export', 'lead_dataset', 'R3', true, true, true, true, 'bounded_consent_filtered_export'],
  ['growth.metrics.read', 'analytics_segment', 'R0', false, false, false, false, 'aggregated_deidentified_metrics'],
  ['growth.campaigns.read', 'campaign', 'R0', true, false, false, false, 'consent_aware_campaign_aggregates'],
  ['support.tickets.list', 'support_queue', 'R0', false, false, false, false, 'minimized_ticket_metadata'],
  ['support.tickets.read', 'ticket', 'R0', true, false, false, false, 'redacted_ticket_content'],
  ['support.tickets.update', 'ticket', 'R1', true, false, false, true, 'ticket_status_assignment_metadata'],
  ['support.access.request', 'client_support_scope', 'R2', true, true, true, true, 'time_limited_customer_authorized_support'],
  ['security.audit.read', 'audit_query', 'R0', false, false, false, false, 'redacted_audit_events'],
  ['security.audit.export', 'audit_dataset', 'R3', true, true, true, true, 'bounded_redacted_audit_export'],
  ['security.operator.read', 'operator', 'R2', true, true, false, false, 'minimal_operator_security_metadata'],
  ['security.operator.grant', 'operator_role_grant', 'R3', true, true, true, true, 'operator_role_grant_change'],
  ['security.operator.revoke', 'operator_role_grant', 'R2', true, true, false, true, 'operator_grant_revocation'],
  ['settings.read', 'setting_group', 'R0', false, false, false, false, 'non_secret_configuration'],
  ['settings.update', 'setting_key', 'R2', true, true, true, true, 'typed_allowlisted_configuration_change'],
  ['integrations.health.read', 'integration', 'R0', true, false, false, false, 'sanitized_integration_health'],
  ['integrations.configure', 'integration', 'R3', true, true, true, true, 'write_only_secret_rotation_and_config'],
  ['releases.status.read', 'release_environment', 'R0', true, false, false, false, 'build_and_deployment_status'],
  ['releases.deploy.production', 'production_release', 'R3', true, true, true, true, 'verified_artifact_and_rollback_plan'],
  ['security.sessions.revoke', 'operator_session', 'R2', true, true, false, true, 'session_revocation_metadata'],
  ['privacy.retention.read', 'data_domain', 'R0', true, false, false, false, 'retention_policy_metadata'],
  ['privacy.export.request', 'privacy_dataset', 'R3', true, true, true, true, 'purpose_limited_privacy_export']
];

const RISK_TIERS = Object.freeze(['R0', 'R1', 'R2', 'R3']);

const ACTION_DEFINITIONS = Object.freeze(DEFINITIONS.map((row) => {
  const [
    actionId, targetType, riskTier, targetRequired,
    requiresStepUp, requiresConfirmation, requiresIndependentApproval, dataBoundary
  ] = row;
  return Object.freeze({
    actionId,
    enabled: false,
    targetType,
    targetRequired,
    riskTier,
    requiredCapability: actionId,
    requiresStepUp,
    requiresConfirmation,
    requiresIndependentApproval,
    idempotencyRequired: riskTier !== 'R0',
    auditEventType: 'dcc.' + actionId,
    dataBoundary
  });
}));

const DEFINITIONS_BY_ID = Object.freeze(Object.fromEntries(
  ACTION_DEFINITIONS.map((definition) => [definition.actionId, definition])
));

function listDeveloperActionDefinitions() {
  return ACTION_DEFINITIONS;
}

/**
 * Return executable policy only for explicitly enabled actions.
 * No action in this foundation is enabled, so this intentionally returns null
 * for every current and unknown action until a reviewed release changes it.
 */
function getEnabledDeveloperActionPolicy(actionId) {
  if (typeof actionId !== 'string' || !Object.hasOwn(DEFINITIONS_BY_ID, actionId)) return null;
  const definition = DEFINITIONS_BY_ID[actionId];
  if (definition.enabled !== true) return null;
  return definition;
}

function validateDeveloperActionRegistry(definitions = ACTION_DEFINITIONS) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return { ok: false, error: 'registry_empty_or_invalid' };
  }
  const seen = new Set();
  for (const item of definitions) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'definition_invalid' };
    if (typeof item.actionId !== 'string' || !/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/.test(item.actionId)) {
      return { ok: false, error: 'action_id_invalid' };
    }
    if (seen.has(item.actionId)) return { ok: false, error: 'duplicate_action_id' };
    seen.add(item.actionId);
    if (item.enabled !== false && item.enabled !== true) return { ok: false, error: 'enabled_flag_invalid' };
    if (!['platform', 'service', 'incident', 'client_collection', 'client', 'client_new',
      'subscription_collection', 'subscription', 'invoice', 'payment', 'lead_collection',
      'lead', 'lead_dataset', 'analytics_segment', 'campaign', 'support_queue', 'ticket',
      'client_support_scope', 'audit_query', 'audit_dataset', 'operator', 'operator_role_grant',
      'setting_group', 'setting_key', 'integration', 'release_environment', 'production_release',
      'operator_session', 'data_domain', 'privacy_dataset'].includes(item.targetType)) {
      return { ok: false, error: 'target_type_invalid' };
    }
    if (!RISK_TIERS.includes(item.riskTier)) return { ok: false, error: 'risk_tier_invalid' };
    if (item.requiredCapability !== item.actionId) return { ok: false, error: 'capability_binding_invalid' };
    for (const field of ['targetRequired', 'requiresStepUp', 'requiresConfirmation',
      'requiresIndependentApproval', 'idempotencyRequired']) {
      if (typeof item[field] !== 'boolean') return { ok: false, error: 'control_flag_invalid' };
    }
    if (typeof item.auditEventType !== 'string' || !item.auditEventType.startsWith('dcc.')) {
      return { ok: false, error: 'audit_event_invalid' };
    }
    if (typeof item.dataBoundary !== 'string' || !item.dataBoundary.trim()) {
      return { ok: false, error: 'data_boundary_missing' };
    }
    if (item.riskTier === 'R3' &&
        (!item.requiresStepUp || !item.requiresConfirmation || !item.requiresIndependentApproval || !item.idempotencyRequired)) {
      return { ok: false, error: 'critical_action_controls_missing' };
    }
  }
  return { ok: true, count: definitions.length };
}

module.exports = {
  ACTION_DEFINITIONS,
  getEnabledDeveloperActionPolicy,
  listDeveloperActionDefinitions,
  validateDeveloperActionRegistry
};
