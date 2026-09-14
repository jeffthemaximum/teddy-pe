require "spec_helper"
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"

abort("The Rails environment is running in production mode!") if Rails.env.production?

require "rspec/rails"
require "database_cleaner/active_record"
require "simplecov"
SimpleCov.start "rails"

Dir[Rails.root.join("spec/support/**/*.rb")].sort.each { |f| require f }

ActiveRecord::Migration.maintain_test_schema!

RSpec.configure do |config|
  config.fixture_paths = [ Rails.root.join("spec/fixtures") ]
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  config.include FactoryBot::Syntax::Methods
  config.include ActiveSupport::Testing::TimeHelpers

  # The login throttle counts into Rails.cache. Without this, one example's
  # attempts push the next one over the limit and the failure lands somewhere
  # unrelated.
  config.before(:each) { Rails.cache.clear }

  # Only covers the legacy tables while Legacy::Record rides the primary
  # connection. Once LEGACY_DATABASE_URL names a real separate database, the
  # per-example transaction below no longer reaches these rows, so they would
  # otherwise pile up across examples and make later specs order-dependent.
  config.before(:each, :legacy) { LegacyTables.truncate! }

  config.before(:suite) { DatabaseCleaner.clean_with(:truncation) }
  config.before(:suite) { LegacyTables.create! }
  config.before(:each) { DatabaseCleaner.strategy = :transaction }
  config.around(:each) { |example| DatabaseCleaner.cleaning { example.run } }
end

Shoulda::Matchers.configure do |config|
  config.integrate do |with|
    with.test_framework :rspec
    with.library :rails
  end
end
