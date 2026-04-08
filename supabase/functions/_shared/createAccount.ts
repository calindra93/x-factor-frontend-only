import { supabaseAdmin } from './lib/supabaseAdmin.ts';
import { createSupabaseEntitiesAdapter } from './lib/supabaseEntityAdapter.ts';
import bcrypt from 'npm:bcryptjs';

const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 64,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true
};

// Access codes are now managed in the database

const getPasswordIssues = (password: string) => {
  const issues: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    issues.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long.`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    issues.push(`Password must be no more than ${PASSWORD_POLICY.maxLength} characters long.`);
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    issues.push('Password must include at least one lowercase letter.');
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    issues.push('Password must include at least one uppercase letter.');
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    issues.push('Password must include at least one number.');
  }

  return issues;
};

const isValidEmail = (email: string) => /.+@.+\..+/.test(email);

export async function handleRequest(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }

  try {
    const body = await req.json();
    const email = String(body?.email ?? '').trim();
    const password = String(body?.password ?? '');
    const accessCode = String(body?.accessCode ?? '');

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return Response.json({ error: 'Email address is invalid.' }, { status: 400 });
    }

    // Validate access code from database
    const entities = createSupabaseEntitiesAdapter(supabaseAdmin);
    const validCodes = await entities.AccessCode.filter({
      code: accessCode,
      is_active: true
    });

    if (validCodes.length === 0) {
      return Response.json({ error: 'Invalid or expired access code.' }, { status: 403 });
    }

    const codeRecord = validCodes[0];
    
    // Check if code has uses remaining
    if (codeRecord.uses_remaining !== -1 && codeRecord.uses_remaining <= 0) {
      return Response.json({ error: 'This access code has been used up.' }, { status: 403 });
    }

    const passwordIssues = getPasswordIssues(password);
    if (passwordIssues.length > 0) {
      return Response.json({ error: 'Password does not meet requirements.', issues: passwordIssues }, { status: 400 });
    }

    const existingUsers = await entities.UserAccount.filter({ email });
    if (existingUsers.length > 0) {
      return Response.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(12));

    const user = await entities.UserAccount.create({
      email,
      password_hash: passwordHash
    });

    // Update access code usage
    await entities.AccessCode.update(codeRecord.id, {
      times_used: codeRecord.times_used + 1,
      uses_remaining: codeRecord.uses_remaining === -1 ? -1 : codeRecord.uses_remaining - 1,
      is_active: codeRecord.uses_remaining === 1 ? false : codeRecord.is_active
    });

    return Response.json({ status: 'created', user_id: user.id });
  } catch (error) {
    console.error('Account creation error:', error);
    return Response.json({ error: 'Failed to create account.' }, { status: 500 });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}