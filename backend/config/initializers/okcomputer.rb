# Fly polls this on a sleeping machine, so keep it to a connection check and
# nothing that wakes Neon harder than it has to.
OkComputer::Registry.register "database", OkComputer::ActiveRecordCheck.new
OkComputer.make_optional %w[database] if Rails.env.development?
