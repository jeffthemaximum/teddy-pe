# The json gem this app is locked to (3.0.2) dropped support for the
# quirks_mode keyword that every Rails version through 8.0 still passes on
# every #to_json call. Left alone, that turns any `render json:` (this
# task's whole point) into an ArgumentError. quirks_mode only ever mattered
# for encoding a bare scalar as top-level JSON, which nothing here needs, so
# dropping it is safe.
module ActiveSupport
  module JSON
    module Encoding
      class JSONGemEncoder
        private

        def stringify(jsonified)
          ::JSON.generate(jsonified, max_nesting: false)
        end
      end
    end
  end
end
