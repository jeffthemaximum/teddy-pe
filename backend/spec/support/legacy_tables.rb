# backend/spec/support/legacy_tables.rb
#
# The old Vercel functions created their tables on a cold start rather than
# through a migration, so there is no schema file to load. These two
# statements are transcribed by hand from api/diary.js and api/results.js.
# Reading them from those files instead would make this fixture agree with a
# shape the migrator has never actually seen.
module LegacyTables
  DIARY = <<~SQL
    create table if not exists diary_entry (
      id            text primary key,
      created_at    timestamptz not null default now(),
      session_date  date        not null,
      dow           text,
      plan_month    text,
      week          integer,
      overall       smallint,
      energy        smallint,
      flag_pain     boolean     not null default false,
      pain_note     text,
      note          text,
      ratings       jsonb       not null default '{}'::jsonb,
      challenge_num text,
      device        text
    )
  SQL

  RESULT = <<~SQL
    create table if not exists test_result (
      id          text primary key,
      test_window text        not null,
      test_id     text        not null,
      value       text        not null,
      recorded_at timestamptz not null default now(),
      device      text
    )
  SQL

  def self.create!
    connection = ActiveRecord::Base.connection
    connection.execute(DIARY)
    connection.execute(RESULT)
  end

  def self.truncate!
    connection = ActiveRecord::Base.connection
    connection.execute("truncate diary_entry, test_result")
  end
end
