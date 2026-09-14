require "rails_helper"

# brakeman raises EOLRails on Rails 8.0 and that warning is ignored in
# config/brakeman.ignore, because the fix is an upgrade and a deploy rather
# than an edit. The ignore cannot lift itself: brakeman fingerprints a warning
# from its code, file and confidence and never from its message, so the entry
# covers every later Rails too.
#
# This is the alarm that does fire. It names a date, it lives in the suite
# Jeff runs, and it fails loudly rather than going quiet.
RSpec.describe "the Rails series this API runs on" do
  # https://rubyonrails.org/maintenance
  SUPPORTED_UNTIL = {
    "8.0" => Date.new(2026, 11, 7),
    "8.1" => Date.new(2027, 10, 10)
  }.freeze

  it "still gets security patches" do
    series = Rails.version.split(".").first(2).join(".")
    ends_on = SUPPORTED_UNTIL[series]

    expect(ends_on).not_to be_nil,
      "Rails #{Rails.version} is not in this table. Add the series and its end-of-life " \
      "date from https://rubyonrails.org/maintenance, and clear the EOLRails entry out " \
      "of config/brakeman.ignore while you are in there."

    expect(Date.current).to be < ends_on,
      "Rails #{series} stopped getting security patches on #{ends_on}. This API is on " \
      "the public internet with a child's journal behind it. Upgrade, then delete the " \
      "EOLRails entry from config/brakeman.ignore."
  end
end
