module Legacy
  # The old Vercel functions wrote to Neon directly. Their tables may sit in
  # the same database as this app or in a different one, so the URL is a
  # separate setting that falls back to this app's own. Set
  # LEGACY_DATABASE_URL only if the old rows live somewhere else.
  #
  # Every subclass is read-only. The old rows are the only copy of a year of
  # Teddy's program until the verifier says otherwise, and a migrator that
  # can write to its own source can destroy the thing it is copying.
  class Record < ActiveRecord::Base
    self.abstract_class = true

    def self.legacy_url
      ENV["LEGACY_DATABASE_URL"].presence || ENV.fetch("DATABASE_URL")
    end

    # A separate pool only when the old rows really are somewhere else.
    # Sharing the primary connection is both correct when the two live in one
    # Neon database and necessary for the specs, which insert legacy fixtures
    # inside a transaction a second connection could not see.
    def self.connect!
      return if @connected
      url = ENV["LEGACY_DATABASE_URL"].presence
      establish_connection(legacy_url) if url && url != ENV["DATABASE_URL"]
      @connected = true
    end

    def readonly? = true
  end
end
