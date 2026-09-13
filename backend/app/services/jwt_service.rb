# HS256 tokens signed with secret_key_base.
#
# 90 days matches the life of the cookie the old passphrase gate issued, so
# signing in keeps feeling the same. A rejected token drops the client back to
# the login screen, which is the whole recovery path.
class JwtService
  ALG = "HS256".freeze
  DEFAULT_TTL = 90.days

  class InvalidToken < StandardError; end

  def self.encode(user_id:, password_digest: nil, ttl: DEFAULT_TTL)
    payload = { sub: user_id, iat: Time.current.to_i, exp: (Time.current + ttl).to_i }
    # Changing a password invalidates every token issued before it, which is
    # the only revocation a stateless design gets. Sixteen hex characters of a
    # digest hash, never the digest itself.
    payload[:pwd] = fingerprint(password_digest) if password_digest
    JWT.encode(payload, secret, ALG)
  end

  def self.decode(token)
    decoded, _header = JWT.decode(token, secret, true, { algorithm: ALG })
    decoded.with_indifferent_access
  rescue JWT::DecodeError => e
    raise InvalidToken, e.message
  end

  def self.fingerprint(password_digest)
    Digest::SHA256.hexdigest(password_digest.to_s)[0, 16]
  end

  def self.secret
    Rails.application.secret_key_base
  end
end
