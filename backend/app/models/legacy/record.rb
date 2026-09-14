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

    # Which database the old rows were actually read out of, in words a
    # person can check at a glance.
    #
    # The missing-table check catches a connection with no legacy tables on
    # it. It cannot catch the other way of being pointed at the wrong place:
    # LEGACY_DATABASE_URL naming a database that HAS both tables and is not
    # the live one. A Neon branch, a restored snapshot, a staging copy. Neon
    # hands out branches freely enough that this is a plausible typo, and a
    # near-empty branch produces no missing tables, no comparable rows, and a
    # verifier that reads clean over rows it never saw.
    #
    # No gate can tell a real empty table from the wrong database, so this is
    # not one. It is the first line of every task's output, so whoever types
    # CONFIRM=yes can see what the numbers underneath describe.
    #
    # The host and the database name only. Never the password and never the
    # whole URL: this goes into a terminal and from a terminal into a paste.
    def self.source_description
      config = connection_db_config.configuration_hash
      where = config[:host].presence || "a local socket"
      where = "#{where}:#{config[:port]}" if config[:port].present? && config[:host].present?
      "#{config[:database]} on #{where}"
    end
  end
end
