import { run, get } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Approves a proposal and triggers the (mocked) outreach email hook.
 * Business logic extracted from the original inline route handler —
 * behavior unchanged, including the console-logged hook trigger.
 */
export async function approveProposal(id) {
  const proposalId = parseInt(id);
  if (isNaN(proposalId)) {
    throw ApiError.badRequest('Invalid proposal ID. Must be an integer.');
  }

  const proposal = await get('SELECT * FROM proposals WHERE id = ?', [proposalId]);
  if (!proposal) {
    throw ApiError.notFound(`Proposal with ID ${proposalId} not found.`);
  }

  await run('UPDATE proposals SET status = ? WHERE id = ?', ['approved', proposalId]);

  // Get the associated company for the email hook trigger details.
  const company = await get('SELECT * FROM legacy_companies WHERE id = ?', [proposal.company_id]);

  // Mocked hook execution log/trigger — no real email dispatch exists yet.
  console.log(`[EMAIL HOOK TRIGGERED] Dispatching approved email draft for proposal ID: ${proposalId} (Company: ${company ? company.name : 'Unknown'})`);
  console.log(`Draft Subject: Business Opportunity Proposal`);
  console.log(`Draft Content Preview:\n${proposal.email_draft}\n`);

  const updatedProposal = await get('SELECT * FROM proposals WHERE id = ?', [proposalId]);

  return {
    proposal: updatedProposal,
    emailHook: {
      status: 'triggered',
      triggered_at: new Date().toISOString(),
      recipient: company ? `${company.name} Representative` : 'Unknown Partner',
      success: true
    }
  };
}