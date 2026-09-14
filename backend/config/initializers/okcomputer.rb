# Fly polls this on a sleeping machine, so keep it to a connection check and
# nothing that wakes Neon harder than it has to.
#
# Two things about the shape of this file, both learned the hard way.
#
# The engine root runs the check named "default" and nothing else. /healthz is
# the engine root and the path fly.toml polls, so registering the database
# check under the name "database" put it on /healthz/database and left Fly's
# probe, and the deploy gate, asking only whether Puma answers. Measured: with
# the database unreachable, /healthz returned 200 "Application is running".
# It is registered under both names now, so the root asks a real question.
#
# And a check may say only whether it passed. The gem's own ActiveRecordCheck
# renders the schema version when healthy and the raw driver exception when
# not, and a PG::ConnectionBad message carries the host, the port, the database
# and the user straight off the Neon connection string. /healthz is public on
# the internet, and everywhere else this app answers "Something went wrong."
class DatabaseCheck < OkComputer::Check
  def check
    # SELECT 1 rather than the schema version: the cheapest question that
    # still proves a live connection, and an answer that gives nothing away.
    ActiveRecord::Base.connection.select_value("SELECT 1")
    mark_message "ok"
  rescue StandardError => e
    # The detail goes to the log, which is Jeff's. The caller gets "not ok".
    Rails.logger.error("[healthz] database check failed: #{e.class}: #{e.message}")
    mark_failure
    mark_message "not ok"
  end
end

OkComputer::Registry.register "default", DatabaseCheck.new
OkComputer::Registry.register "database", DatabaseCheck.new
OkComputer.make_optional %w[default database] if Rails.env.development?
