class User < ApplicationRecord
  ROLES = %w[coach athlete viewer].freeze

  has_secure_password
  has_one :athlete, dependent: :nullify

  before_validation { self.email = email.to_s.strip.downcase.presence }

  validates :email, presence: true, uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true
  validates :role, inclusion: { in: ROLES }
  # Six, lowered from twelve on 14 September 2026 at Jeff's call. What holds
  # an online guessing run is the throttle on AuthController#login, 10 attempts
  # in 3 minutes, not this. This is the floor for the other case, where the
  # database itself leaks and bcrypt is the only thing left. Asserted from both
  # sides in spec/models/user_spec.rb, which had not existed: the old number
  # had no test, which is why moving it looked free.
  validates :password, length: { minimum: 6 }, allow_nil: true

  ROLES.each { |r| define_method("#{r}?") { role == r } }
end
