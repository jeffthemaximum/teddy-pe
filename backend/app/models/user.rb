class User < ApplicationRecord
  ROLES = %w[coach athlete viewer].freeze

  has_secure_password
  has_one :athlete, dependent: :nullify

  before_validation { self.email = email.to_s.strip.downcase.presence }

  validates :email, presence: true, uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true
  validates :role, inclusion: { in: ROLES }
  validates :password, length: { minimum: 12 }, allow_nil: true

  ROLES.each { |r| define_method("#{r}?") { role == r } }
end
