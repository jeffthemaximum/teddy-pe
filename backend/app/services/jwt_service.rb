# HS256 tokens signed with secret_key_base.
#
# 90 days matches the life of the cookie the old passphrase gate issued, so
# signing in keeps feeling the same. A rejected token drops the client back to
# the login screen, which is the whole recovery path.
class JwtService
  ALG = "HS256".freeze
  DEFAULT_TTL = 90.days

  class InvalidToken < StandardError; end

  def self.encode(user_id:, ttl: DEFAULT_TTL)
    JWT.encode({ sub: user_id, iat: Time.current.to_i, exp: (Time.current + ttl).to_i }, secret, ALG)
  end

  def self.decode(token)
    decoded, _header = JWT.decode(token, secret, true, { algorithm: ALG })
    decoded.with_indifferent_access
  rescue JWT::DecodeError => e
    raise InvalidToken, e.message
  end

  def self.secret
    Rails.application.secret_key_base
  end
end
